import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { Session, SessionStatus, ClaudeOperationStatus } from '../types/Session.js';
import { listTmuxSessions, listTmuxPanes, isClaudeSessionFast, isClaudeSessionDeep, TmuxPane, TmuxSession, DELIMITER } from '../utils/tmux.js';
import { sshConnectionManager } from './SSHConnectionManager.js';
import { getAllHosts, SSHHostConfig } from '../config/hosts.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const exec = promisify(execCallback);

export class SessionDiscoveryService {
  private sessions: Map<string, Session> = new Map();
  private sessionWorkspaceMap: Map<string, string | null> = new Map(); // sessionId -> workspaceId
  private hiddenSessions: Set<string> = new Set(); // sessionIds that are hidden from workspace
  private readonly sessionWorkspacesPath: string;
  private readonly hiddenSessionsPath: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(sessions: Session[]) => void> = new Set();

  constructor() {
    this.sessionWorkspacesPath = path.join(os.homedir(), '.session-manager', 'session-workspaces.json');
    this.hiddenSessionsPath = path.join(os.homedir(), '.session-manager', 'hidden-sessions.json');
    this.loadSessionWorkspaces();
    this.loadHiddenSessions();
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

  private loadHiddenSessions(): void {
    try {
      if (fs.existsSync(this.hiddenSessionsPath)) {
        const data = fs.readFileSync(this.hiddenSessionsPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.hiddenSessions = new Set(parsed);
      }
    } catch (err) {
      console.error('Failed to load hidden sessions:', err);
      this.hiddenSessions = new Set();
    }
  }

  private saveHiddenSessions(): void {
    try {
      const dir = path.dirname(this.hiddenSessionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.hiddenSessions);
      const tempPath = `${this.hiddenSessionsPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.hiddenSessionsPath);
    } catch (err) {
      console.error('Failed to save hidden sessions:', err);
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

  private async captureLastOutput(sessionName: string, paneId: string, isRemote: boolean = false, hostId?: string): Promise<string | undefined> {
    try {
      // Capture the last non-empty line from the pane using session.paneId format
      const tmuxTarget = `${sessionName}.${paneId}`;
      const cmd = `tmux capture-pane -t '${tmuxTarget}' -p -S -5 2>/dev/null | grep -v '^$' | tail -1`;
      let output: string;

      if (isRemote && hostId) {
        output = await sshConnectionManager.exec(hostId, cmd);
      } else {
        const result = await exec(cmd);
        output = result.stdout;
      }

      const lastLine = output.trim();
      if (lastLine) {
        // Clean up ANSI escape codes and limit length
        const cleaned = lastLine
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // Remove ANSI codes
          .replace(/[\x00-\x1f]/g, '')  // Remove control characters
          .trim()
          .slice(0, 100);  // Limit to 100 chars
        return cleaned || undefined;
      }
    } catch {
      // Silently fail - preview is optional
    }
    return undefined;
  }

  private async captureStatusBar(sessionName: string, isRemote: boolean = false, hostId?: string): Promise<string | undefined> {
    try {
      // Capture the tmux status-right content using format expansion
      // #{T:status-right} expands the status-right format string
      const cmd = `tmux display-message -t '${sessionName}' -p -F "#{T:status-right}" 2>/dev/null`;
      let output: string;

      if (isRemote && hostId) {
        output = await sshConnectionManager.exec(hostId, cmd);
      } else {
        const result = await exec(cmd);
        output = result.stdout;
      }

      const statusBar = output.trim();
      if (statusBar) {
        // Clean up ANSI escape codes and special characters
        const cleaned = statusBar
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // Remove ANSI codes
          .replace(/#\[[^\]]*\]/g, '')  // Remove tmux style tags like #[fg=color]
          .replace(/[\x00-\x1f]/g, '')  // Remove control characters
          .trim()
          .slice(0, 150);  // Limit to 150 chars
        return cleaned || undefined;
      }
    } catch {
      // Silently fail - status bar is optional
    }
    return undefined;
  }

  private async captureUserLastInput(sessionName: string, paneId: string, isRemote: boolean = false, hostId?: string): Promise<string | undefined> {
    try {
      // Capture more lines from the pane to find user input
      const tmuxTarget = `${sessionName}.${paneId}`;
      // Get last 50 lines to have enough context to find user prompts
      const cmd = `tmux capture-pane -t '${tmuxTarget}' -p -S -50 2>/dev/null`;
      let output: string;

      if (isRemote && hostId) {
        output = await sshConnectionManager.exec(hostId, cmd);
      } else {
        const result = await exec(cmd);
        output = result.stdout;
      }

      const lines = output.split('\n');

      // Look for user input patterns from bottom to top
      // Claude CLI uses various prompt patterns: ">", "❯", "human>", or shell prompts
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line || line.trim().length === 0) continue;

        // Clean ANSI codes and control characters more thoroughly
        const cleanLine = line
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // Remove ANSI escape sequences
          .replace(/\x1b\][0-9;]*\x07/g, '')      // Remove OSC sequences
          .replace(/\x1b\][0-9;]*;[^\x07]*\x07/g, '')  // Remove OSC with params
          .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')  // Remove control chars except \t and \n
          .trim();

        if (!cleanLine || cleanLine.length === 0) continue;

        // Skip system messages and status lines
        if (this.isSystemMessage(cleanLine)) continue;

        // Pattern 1: Lines starting with ">" (common Claude prompt)
        if (cleanLine.startsWith('>') && cleanLine.length > 1) {
          const userInput = cleanLine.slice(1).trim();
          if (this.isValidUserInput(userInput)) {
            return userInput.slice(0, 100);
          }
        }

        // Pattern 2: Lines starting with "❯" (modern shell/Claude prompt)
        if (cleanLine.startsWith('❯') && cleanLine.length > 1) {
          const userInput = cleanLine.slice(1).trim();
          if (this.isValidUserInput(userInput)) {
            return userInput.slice(0, 100);
          }
        }

        // Pattern 3: Lines starting with "human>" or "Human>"
        const humanMatch = cleanLine.match(/^human>\s*(.+)$/i);
        if (humanMatch && humanMatch[1]) {
          const userInput = humanMatch[1].trim();
          if (this.isValidUserInput(userInput)) {
            return userInput.slice(0, 100);
          }
        }

        // Pattern 4: Shell prompts "$ command" or "% command"
        const shellMatch = cleanLine.match(/^[$%]\s+(.+)$/);
        if (shellMatch && shellMatch[1]) {
          const userInput = shellMatch[1].trim();
          if (this.isValidUserInput(userInput)) {
            return userInput.slice(0, 100);
          }
        }

        // Pattern 5: Lines containing "> " with text after (multi-line Claude prompts)
        const multiLineMatch = cleanLine.match(/>\s+(.+)$/);
        if (multiLineMatch && multiLineMatch[1]) {
          const userInput = multiLineMatch[1].trim();
          if (this.isValidUserInput(userInput) && userInput.length > 10) {
            // Only accept if substantial (likely real input, not prompt artifact)
            return userInput.slice(0, 100);
          }
        }
      }
    } catch {
      // Silently fail - user input is optional
    }
    return undefined;
  }

  private isSystemMessage(line: string): boolean {
    // Filter out common system messages and status lines
    const systemPatterns = [
      /^claude/i,
      /^assistant/i,
      /^thinking/i,
      /^loading/i,
      /^waiting/i,
      /^\[.*\]$/,  // [status messages]
      /^─+$/,      // Horizontal lines
      /^═+$/,      // Double lines
      /^\s*$/,     // Empty or whitespace only
      /^•/,        // Bullet points from responses
      /^-{3,}/,    // Markdown separators
      /^\d+\./,    // Numbered lists from responses
    ];

    return systemPatterns.some(pattern => pattern.test(line));
  }

  private isValidUserInput(input: string): boolean {
    if (!input || input.length === 0) return false;
    if (input.length > 200) return false;  // Too long, likely not a prompt

    // Filter out common non-input patterns
    const invalidPatterns = [
      /^-+$/,           // Just dashes
      /^═+$/,           // Just double lines
      /^\.{3,}$/,       // Just dots
      /^\s+$/,          // Just whitespace
      /^[\x00-\x1F]+$/, // Just control characters
    ];

    return !invalidPatterns.some(pattern => pattern.test(input));
  }

  private async captureConversationSummary(workingDirectory: string | null): Promise<string | undefined> {
    if (!workingDirectory) return undefined;

    try {
      // Convert working directory to Claude project path format
      // e.g., /home/devswha/workspace/quant-magi -> -home-devswha-workspace-quant-magi
      const projectPath = workingDirectory.replace(/^\//g, '').replace(/\//g, '-');
      const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');

      // Find matching project directory (could have suffix like -shellspace)
      const findCmd = `find "${claudeProjectsDir}" -maxdepth 1 -type d -name "*${projectPath}*" 2>/dev/null | head -1`;
      const { stdout: projectDir } = await exec(findCmd);

      if (!projectDir.trim()) return undefined;

      // Try to read from sessions-index.json first (more reliable)
      const sessionsIndexPath = path.join(projectDir.trim(), 'sessions-index.json');
      try {
        const indexContent = fs.readFileSync(sessionsIndexPath, 'utf-8');
        const indexData = JSON.parse(indexContent);
        const entries = indexData.entries || [];

        // Get the most recent session's summary
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          const summary = lastEntry.summary || lastEntry.title || lastEntry.prompt;
          if (summary && typeof summary === 'string') {
            return summary.slice(0, 100);
          }
        }
      } catch {
        // Fall through to JSONL parsing
      }

      // Fallback: Find the most recent JSONL file and look for summary
      const findJsonlCmd = `find "${projectDir.trim()}" -maxdepth 1 -name "*.jsonl" -type f 2>/dev/null | xargs ls -t 2>/dev/null | head -1`;
      const { stdout: jsonlFile } = await exec(findJsonlCmd);

      if (!jsonlFile.trim()) return undefined;

      // Read the last summary entry from the JSONL file
      const grepCmd = `grep '"type":"summary"' "${jsonlFile.trim()}" 2>/dev/null | tail -1`;
      const { stdout: summaryLine } = await exec(grepCmd);

      if (!summaryLine.trim()) return undefined;

      // Parse the JSON and extract the summary field
      const data = JSON.parse(summaryLine.trim());
      const summary = data.summary;

      if (summary && typeof summary === 'string') {
        return summary.slice(0, 100);  // Limit to 100 chars
      }
    } catch {
      // Silently fail - summary is optional
    }
    return undefined;
  }

  private async detectClaudeOperationStatus(
    sessionName: string,
    paneId: string,
    workingDirectory: string | null,
    statusBar: string | undefined,
    isRemote: boolean = false,
    hostId?: string
  ): Promise<ClaudeOperationStatus> {
    // ============================================
    // PRIORITY 1: Terminal buffer patterns (vanilla Claude Code - no OMC required)
    // ============================================
    try {
      const tmuxTarget = `${sessionName}.${paneId}`;
      const cmd = `tmux capture-pane -t '${tmuxTarget}' -p -S -10 2>/dev/null | tail -5`;
      let output: string;

      if (isRemote && hostId) {
        output = await sshConnectionManager.exec(hostId, cmd);
      } else {
        const result = await exec(cmd);
        output = result.stdout;
      }

      const lines = output.split('\n').filter(l => l.trim());
      const lastLine = lines[lines.length - 1] || '';
      const cleanLine = lastLine
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/[\x00-\x1f]/g, '')
        .trim();

      // Check for active spinner patterns (Claude is thinking)
      // Braille spinner patterns used by Claude Code
      const spinnerPatterns = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠠⠄⠂⠁]/;
      if (spinnerPatterns.test(cleanLine)) {
        return 'thinking';
      }

      // Check for Claude status text patterns
      const thinkingTextPatterns = [
        /Thinking\.\.\./i,
        /Running tool\.\.\./i,
        /Searching\.\.\./i,
        /Reading\.\.\./i,
        /Writing\.\.\./i,
        /Executing\.\.\./i,
      ];
      for (const pattern of thinkingTextPatterns) {
        if (pattern.test(cleanLine)) {
          return 'thinking';
        }
      }

      // Check for input prompt patterns (Claude is waiting)
      if (/^[>❯]\s*$/.test(cleanLine) || /^human>\s*$/i.test(cleanLine)) {
        return 'waiting_for_input';
      }

      // Check for error patterns - require specific Claude/tool error formats
      // More specific patterns to avoid false positives from log output
      const errorPatterns = [
        /^Error:/,              // Line starts with "Error:"
        /^error\[E\d+\]/,       // Rust-style error codes
        /ToolError:/,           // Claude tool errors
        /APIError:/,            // API errors
        /FAILED:/i,             // Explicit FAILED prefix
        /^panic:/i,             // Rust/Go panics
        /^fatal:/i,             // Fatal errors
        /^Exception:/,          // Exception prefix
        /^\s*×/,                // Error symbol used by some CLIs
      ];
      for (const pattern of errorPatterns) {
        if (pattern.test(cleanLine)) {
          return 'error';
        }
      }
    } catch {
      // Continue to other signals
    }

    // ============================================
    // PRIORITY 2: JSONL file activity (vanilla Claude Code - no OMC required)
    // ============================================
    if (workingDirectory) {
      try {
        const projectPath = workingDirectory.replace(/^\//g, '').replace(/\//g, '-');
        const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
        const findCmd = `find "${claudeProjectsDir}" -maxdepth 1 -type d -name "*${projectPath}*" 2>/dev/null | head -1`;
        const { stdout: projectDir } = await exec(findCmd);

        if (projectDir.trim()) {
          // Find most recent JSONL file
          const findJsonlCmd = `find "${projectDir.trim()}" -maxdepth 1 -name "*.jsonl" -type f 2>/dev/null | xargs ls -t 2>/dev/null | head -1`;
          const { stdout: jsonlFile } = await exec(findJsonlCmd);

          if (jsonlFile.trim()) {
            const stats = fs.statSync(jsonlFile.trim());
            const ageMs = Date.now() - stats.mtimeMs;

            // If file modified in last 30 seconds, likely still processing
            if (ageMs < 30000) {
              return 'thinking';
            }
          }
        }
      } catch {
        // Continue to OMC signals (if available)
      }
    }

    // ============================================
    // PRIORITY 3: OMC HUD status bar (optional - only if OMC installed)
    // ============================================
    // Check if .omc directory exists before checking OMC signals
    const omcExists = workingDirectory && fs.existsSync(path.join(workingDirectory, '.omc'));

    if (omcExists && statusBar) {
      // Braille spinner patterns used by OMC HUD
      const spinnerPatterns = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠠⠄⠂⠁]/;
      if (spinnerPatterns.test(statusBar)) {
        return 'thinking';
      }
    }

    // ============================================
    // PRIORITY 4: OMC state files (optional - only if OMC installed)
    // ============================================
    if (omcExists && workingDirectory) {
      try {
        const omcStatePath = path.join(workingDirectory, '.omc', 'state');
        if (fs.existsSync(omcStatePath)) {
          const stateFiles = ['autopilot-state.json', 'ultrawork-state.json', 'ralph-state.json', 'ultrapilot-state.json'];

          for (const file of stateFiles) {
            const filePath = path.join(omcStatePath, file);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf-8');
              const state = JSON.parse(content);
              if (state.active === true) {
                return 'thinking';
              }
            }
          }
        }
      } catch {
        // OMC state check failed, continue to fallback
      }
    }

    // ============================================
    // FALLBACK: Default to idle
    // ============================================
    return 'idle';
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

        // Capture last output line, status bar, conversation summary, and user input for preview
        const [lastOutput, statusBar, conversationSummary, userLastInput] = await Promise.all([
          this.captureLastOutput(tmuxSession.sessionName, pane.paneId),
          this.captureStatusBar(tmuxSession.sessionName),
          this.captureConversationSummary(pane.currentPath),
          this.captureUserLastInput(tmuxSession.sessionName, pane.paneId),
        ]);

        // Detect Claude operation status for Claude sessions
        let claudeStatus: ClaudeOperationStatus | undefined;
        if (isClaudeSession) {
          claudeStatus = await this.detectClaudeOperationStatus(
            tmuxSession.sessionName,
            pane.paneId,
            pane.currentPath,
            statusBar,
            false
          );
        }

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
          lastOutput,
          statusBar,
          conversationSummary,
          userLastInput,
          claudeStatus,
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

          // Skip lastOutput, statusBar, and conversationSummary capture for remote sessions to avoid SSH timeouts
          const lastOutput = undefined;
          const statusBar = undefined;
          const conversationSummary = undefined;

          // Detect Claude operation status for Claude sessions (remote)
          let claudeStatus: ClaudeOperationStatus | undefined;
          if (isClaudeSession) {
            claudeStatus = await this.detectClaudeOperationStatus(
              tmuxSession.sessionName,
              pane.paneId,
              pane.currentPath,
              undefined,  // statusBar not captured for remote
              true,       // isRemote = true
              host.id     // pass the hostId
            );
          }

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
            lastOutput,
            statusBar,
            conversationSummary,
            claudeStatus,
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

  getSessions(includeHidden: boolean = false): Session[] {
    const allSessions = Array.from(this.sessions.values());
    if (includeHidden) {
      return allSessions;
    }
    return allSessions.filter(s => !this.hiddenSessions.has(s.id));
  }

  getManagedSessions(includeHidden: boolean = false): Session[] {
    const allManaged = Array.from(this.sessions.values()).filter(s => this.sessionWorkspaceMap.has(s.id));
    if (includeHidden) {
      return allManaged;
    }
    return allManaged.filter(s => !this.hiddenSessions.has(s.id));
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

  hideSession(sessionId: string): void {
    this.hiddenSessions.add(sessionId);
    this.saveHiddenSessions();
    this.notifyListeners();
  }

  unhideSession(sessionId: string): void {
    this.hiddenSessions.delete(sessionId);
    this.saveHiddenSessions();
    this.notifyListeners();
  }

  isSessionHidden(sessionId: string): boolean {
    return this.hiddenSessions.has(sessionId);
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

  async getAvailableSessions(hostId: string): Promise<{ sessionName: string; sessionId: string; isHidden?: boolean }[]> {
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

    // Get managed sessions (excluding hidden ones)
    const managedSessionNames = new Set(
      this.getManagedSessions()
        .filter(s => s.host.id === hostId)
        .map(s => s.tmux.sessionName)
    );

    // Get hidden sessions for this host
    const hiddenSessions = this.getManagedSessions(true)
      .filter(s => s.host.id === hostId && this.hiddenSessions.has(s.id));

    // Get unique tmux sessions not yet managed (excluding hidden which we'll add separately)
    const uniqueTmuxSessions = new Map<string, { sessionId: string; isHidden: boolean }>();

    // Add hidden sessions first (they should be attachable)
    hiddenSessions.forEach(s => {
      uniqueTmuxSessions.set(s.tmux.sessionName, { sessionId: s.tmux.sessionId, isHidden: true });
    });

    // Add unmanaged discovered sessions
    allDiscovered
      .filter(s => !managedSessionNames.has(s.tmux.sessionName) && !uniqueTmuxSessions.has(s.tmux.sessionName))
      .forEach(s => {
        if (!uniqueTmuxSessions.has(s.tmux.sessionName)) {
          uniqueTmuxSessions.set(s.tmux.sessionName, { sessionId: s.tmux.sessionId, isHidden: false });
        }
      });

    return Array.from(uniqueTmuxSessions.entries()).map(([sessionName, { sessionId, isHidden }]) => ({
      sessionName,
      sessionId,
      isHidden
    }));
  }
}

export const sessionDiscoveryService = new SessionDiscoveryService();
