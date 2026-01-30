import { Session, SessionStatus } from '../types/Session.js';
import { listTmuxSessions, listTmuxPanes, isClaudeSessionFast, isClaudeSessionDeep, TmuxPane, TmuxSession, DELIMITER } from '../utils/tmux.js';
import { sshConnectionManager } from './SSHConnectionManager.js';
import { getAllHosts, SSHHostConfig } from '../config/hosts.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class SessionDiscoveryService {
  private sessions: Map<string, Session> = new Map();
  private sessionWorkspaceMap: Map<string, string | null> = new Map(); // sessionId -> workspaceId
  private readonly sessionWorkspacesPath: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(sessions: Session[]) => void> = new Set();

  constructor() {
    this.sessionWorkspacesPath = path.join(os.homedir(), '.session-manager', 'session-workspaces.json');
    this.loadSessionWorkspaces();
  }

  private loadSessionWorkspaces(): void {
    try {
      if (fs.existsSync(this.sessionWorkspacesPath)) {
        const data = fs.readFileSync(this.sessionWorkspacesPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.sessionWorkspaceMap = new Map(Object.entries(parsed));
      }
    } catch (err) {
      console.error('Failed to load session workspaces:', err);
      this.sessionWorkspaceMap = new Map();
    }
  }

  private saveSessionWorkspaces(): void {
    try {
      const dir = path.dirname(this.sessionWorkspacesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.sessionWorkspaceMap);
      const tempPath = `${this.sessionWorkspacesPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.sessionWorkspacesPath);
    } catch (err) {
      console.error('Failed to save session workspaces:', err);
    }
  }

  setSessionWorkspace(sessionId: string, workspaceId: string | null): void {
    this.sessionWorkspaceMap.set(sessionId, workspaceId);
    this.saveSessionWorkspaces();
    // Update in-memory session if it exists
    const session = this.sessions.get(sessionId);
    if (session) {
      session.workspaceId = workspaceId;
    }
    this.notifyListeners();
  }

  getSessionWorkspace(sessionId: string): string | null {
    return this.sessionWorkspaceMap.get(sessionId) ?? null;
  }

  getSessionsInWorkspace(workspaceId: string): string[] {
    const sessionIds: string[] = [];
    for (const [sessionId, wsId] of this.sessionWorkspaceMap) {
      if (wsId === workspaceId) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
  }

  isManagedSession(sessionId: string): boolean {
    return this.sessionWorkspaceMap.has(sessionId);
  }

  async discoverLocalSessions(): Promise<Session[]> {
    const tmuxSessions = await listTmuxSessions();
    return this.processTmuxSessions(tmuxSessions, {
      id: 'local',
      type: 'local',
      displayName: 'Local',
    });
  }

  async discoverRemoteSessions(host: SSHHostConfig): Promise<Session[]> {
    try {
      // Execute tmux list-sessions on remote
      const sessionFormat = `#{session_id}${DELIMITER}#{session_name}${DELIMITER}#{session_windows}${DELIMITER}#{session_created}`;
      const sessionsOutput = await sshConnectionManager.exec(
        host.id,
        `tmux list-sessions -F '${sessionFormat}' 2>/dev/null || true`
      );

      if (!sessionsOutput.trim()) {
        return [];
      }

      const tmuxSessions: TmuxSession[] = sessionsOutput.trim().split('\n').map(line => {
        const [sessionId, sessionName, windowCount, createdAt] = line.split(DELIMITER);
        return {
          sessionId,
          sessionName,
          windowCount: parseInt(windowCount, 10),
          createdAt: parseInt(createdAt, 10),
        };
      });

      return this.processTmuxSessionsRemote(tmuxSessions, host);
    } catch (err) {
      console.error(`Failed to discover sessions on ${host.id}:`, err);
      return [];
    }
  }

  private async processTmuxSessions(
    tmuxSessions: TmuxSession[],
    hostInfo: { id: string; type: 'local' | 'remote'; displayName: string }
  ): Promise<Session[]> {
    const discovered: Session[] = [];

    for (const tmuxSession of tmuxSessions) {
      const panes = await listTmuxPanes(tmuxSession.sessionName);

      for (const pane of panes) {
        let isClaudeSession = isClaudeSessionFast(pane);

        if (!isClaudeSession && tmuxSession.sessionName.toLowerCase().includes('claude')) {
          isClaudeSession = await isClaudeSessionDeep(pane);
        }

        const sessionId = `${hostInfo.id}:${tmuxSession.sessionId}:${pane.paneId}`;
        const now = new Date().toISOString();

        const session: Session = {
          id: sessionId,
          name: tmuxSession.sessionName,
          host: {
            id: hostInfo.id,
            type: hostInfo.type,
            displayName: hostInfo.displayName,
          },
          tmux: {
            sessionId: tmuxSession.sessionId,
            sessionName: tmuxSession.sessionName,
            paneId: pane.paneId,
            windowIndex: pane.windowIndex,
          },
          status: 'active' as SessionStatus,
          isClaudeSession,
          process: {
            pid: pane.pid,
            currentCommand: pane.currentCommand,
          },
          createdAt: new Date(tmuxSession.createdAt * 1000).toISOString(),
          lastActivityAt: now,
          dimensions: {
            cols: pane.width,
            rows: pane.height,
          },
          workingDirectory: pane.currentPath || null,
          workspaceId: this.sessionWorkspaceMap.get(sessionId) ?? null,
        };

        discovered.push(session);
      }
    }

    return discovered;
  }

  private async processTmuxSessionsRemote(
    tmuxSessions: TmuxSession[],
    host: SSHHostConfig
  ): Promise<Session[]> {
    const discovered: Session[] = [];
    const paneFormat = `#{pane_id}${DELIMITER}#{pane_pid}${DELIMITER}#{pane_current_command}${DELIMITER}#{pane_width}${DELIMITER}#{pane_height}${DELIMITER}#{window_index}${DELIMITER}#{pane_current_path}`;

    for (const tmuxSession of tmuxSessions) {
      try {
        const panesOutput = await sshConnectionManager.exec(
          host.id,
          `tmux list-panes -t '${tmuxSession.sessionName}' -F '${paneFormat}' 2>/dev/null || true`
        );

        if (!panesOutput.trim()) continue;

        const panes: TmuxPane[] = panesOutput.trim().split('\n').map(line => {
          const [paneId, pid, currentCommand, width, height, windowIndex, currentPath] = line.split(DELIMITER);
          return {
            paneId,
            pid: parseInt(pid, 10),
            currentCommand,
            width: parseInt(width, 10),
            height: parseInt(height, 10),
            windowIndex: parseInt(windowIndex, 10),
            currentPath,
          };
        });

        for (const pane of panes) {
          const isClaudeSession = isClaudeSessionFast(pane);
          const sessionId = `${host.id}:${tmuxSession.sessionId}:${pane.paneId}`;
          const now = new Date().toISOString();

          const session: Session = {
            id: sessionId,
            name: tmuxSession.sessionName,
            host: {
              id: host.id,
              type: 'remote',
              displayName: host.name,
            },
            tmux: {
              sessionId: tmuxSession.sessionId,
              sessionName: tmuxSession.sessionName,
              paneId: pane.paneId,
              windowIndex: pane.windowIndex,
            },
            status: 'active' as SessionStatus,
            isClaudeSession,
            process: {
              pid: pane.pid,
              currentCommand: pane.currentCommand,
            },
            createdAt: new Date(tmuxSession.createdAt * 1000).toISOString(),
            lastActivityAt: now,
            dimensions: {
              cols: pane.width,
              rows: pane.height,
            },
            workingDirectory: pane.currentPath || null,
            workspaceId: this.sessionWorkspaceMap.get(sessionId) ?? null,
          };

          discovered.push(session);
        }
      } catch (err) {
        console.error(`Failed to list panes for session ${tmuxSession.sessionName} on ${host.id}:`, err);
      }
    }

    return discovered;
  }

  async refresh(): Promise<Session[]> {
    // Discover local sessions
    const localSessions = await this.discoverLocalSessions();

    // Discover remote sessions in parallel
    const hosts = getAllHosts();
    const remoteDiscoveries = await Promise.allSettled(
      hosts.map(host => this.discoverRemoteSessions(host))
    );

    const remoteSessions: Session[] = [];
    for (const result of remoteDiscoveries) {
      if (result.status === 'fulfilled') {
        remoteSessions.push(...result.value);
      }
    }

    const allDiscovered = [...localSessions, ...remoteSessions];

    // Update session map
    const newMap = new Map<string, Session>();
    for (const session of allDiscovered) {
      const existing = this.sessions.get(session.id);
      if (existing) {
        session.createdAt = existing.createdAt;
      }
      newMap.set(session.id, session);
    }

    // Mark managed sessions as terminated if they no longer exist
    for (const managedId of this.sessionWorkspaceMap.keys()) {
      if (!newMap.has(managedId)) {
        const existing = this.sessions.get(managedId);
        if (existing) {
          existing.status = 'terminated';
          newMap.set(managedId, existing);
        }
      }
    }

    // Enrich all sessions with workspaceId from the map
    for (const [sessionId, session] of newMap) {
      session.workspaceId = this.sessionWorkspaceMap.get(sessionId) ?? null;
    }

    this.sessions = newMap;

    // Notify listeners with only managed sessions
    this.notifyListeners();

    return Array.from(this.sessions.values());
  }

  startPolling(intervalMs: number = 2000): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      this.refresh().catch(console.error);
    }, intervalMs);

    // Initial refresh
    this.refresh().catch(console.error);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  onSessionsChange(listener: (sessions: Session[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getManagedSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => this.sessionWorkspaceMap.has(s.id));
  }

  addManagedSession(sessionId: string, workspaceId: string | null = null): void {
    this.sessionWorkspaceMap.set(sessionId, workspaceId);
    this.saveSessionWorkspaces();
    // Update in-memory session if it exists
    const session = this.sessions.get(sessionId);
    if (session) {
      session.workspaceId = workspaceId;
    }
    this.notifyListeners();
  }

  removeManagedSession(sessionId: string): void {
    this.sessionWorkspaceMap.delete(sessionId);
    this.saveSessionWorkspaces();
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const managedSessions = this.getManagedSessions();
    for (const listener of this.listeners) {
      listener(managedSessions);
    }
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getClaudeSessions(): Session[] {
    return this.getSessions().filter(s => s.isClaudeSession && s.status !== 'terminated');
  }

  getSessionsByHost(hostId: string): Session[] {
    return this.getSessions().filter(s => s.host.id === hostId);
  }

  async getAvailableSessions(hostId: string): Promise<{ sessionName: string; sessionId: string }[]> {
    // Discover all sessions on-demand (not managed ones)
    let allDiscovered: Session[];
    if (hostId === 'local') {
      allDiscovered = await this.discoverLocalSessions();
    } else {
      const host = getAllHosts().find(h => h.id === hostId);
      if (!host) {
        return [];
      }
      allDiscovered = await this.discoverRemoteSessions(host);
    }

    // Filter out sessions that are already managed
    const managedSessionNames = new Set(
      this.getManagedSessions()
        .filter(s => s.host.id === hostId)
        .map(s => s.tmux.sessionName)
    );

    // Get unique tmux sessions not yet managed
    const uniqueTmuxSessions = new Map<string, string>();
    allDiscovered
      .filter(s => !managedSessionNames.has(s.tmux.sessionName))
      .forEach(s => {
        if (!uniqueTmuxSessions.has(s.tmux.sessionName)) {
          uniqueTmuxSessions.set(s.tmux.sessionName, s.tmux.sessionId);
        }
      });

    return Array.from(uniqueTmuxSessions.entries()).map(([sessionName, sessionId]) => ({
      sessionName,
      sessionId
    }));
  }
}

export const sessionDiscoveryService = new SessionDiscoveryService();
