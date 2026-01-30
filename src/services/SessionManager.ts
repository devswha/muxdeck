import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { Session, CreateSessionRequest, AttachSessionRequest } from '../types/Session.js';
import { sessionDiscoveryService } from './SessionDiscoveryService.js';
import { sshConnectionManager } from './SSHConnectionManager.js';

const exec = promisify(execCallback);

export class SessionManager {

  async createSession(request: CreateSessionRequest): Promise<Session> {
    const { workingDirectory, hostId, sessionName, claudeArgs = [], workspaceId } = request;

    // Generate session name if not provided
    const tmuxSessionName = sessionName || `claude-${Date.now()}`;

    // Build claude command
    const claudeCmd = ['claude', ...claudeArgs].join(' ');

    if (hostId === 'local') {
      // Local session creation
      // Validate working directory
      try {
        await exec(`test -d "${workingDirectory}"`);
      } catch {
        throw new Error(`Working directory does not exist: ${workingDirectory}`);
      }

      // Create tmux session with claude
      try {
        await exec(
          `tmux new-session -d -s "${tmuxSessionName}" -c "${workingDirectory}" "${claudeCmd}"`
        );
      } catch (err) {
        throw new Error(`Failed to create tmux session: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      // Remote session creation via SSH
      // Validate working directory exists remotely
      try {
        await sshConnectionManager.exec(hostId, `test -d "${workingDirectory}"`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Check if it's an SSH error vs directory not found
        if (errMsg.includes('Timed out') || errMsg.includes('authentication') || errMsg.includes('connect')) {
          throw new Error(`SSH connection failed to ${hostId}: ${errMsg}`);
        }
        throw new Error(`Working directory does not exist on ${hostId}: ${workingDirectory}`);
      }

      // Create tmux session remotely
      try {
        await sshConnectionManager.exec(
          hostId,
          `tmux new-session -d -s "${tmuxSessionName}" -c "${workingDirectory}" "${claudeCmd}"`
        );
      } catch (err) {
        throw new Error(`Failed to create remote tmux session: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Wait a moment for session to start, then refresh discovery
    await new Promise(resolve => setTimeout(resolve, 500));
    await sessionDiscoveryService.refresh();

    // Find the new session
    const sessions = sessionDiscoveryService.getSessions();
    const newSession = sessions.find(s =>
      s.tmux.sessionName === tmuxSessionName && s.host.id === hostId
    );

    if (!newSession) {
      throw new Error('Session created but not found in discovery');
    }

    // Add to managed sessions
    sessionDiscoveryService.addManagedSession(newSession.id);

    // Set workspace association if provided
    if (workspaceId) {
      sessionDiscoveryService.setSessionWorkspace(newSession.id, workspaceId);
    }

    return newSession;
  }

  async attachSession(request: AttachSessionRequest): Promise<Session> {
    const { sessionName, hostId } = request;

    // Verify the tmux session exists
    let sessionExists = false;
    try {
      if (hostId === 'local') {
        await exec(`tmux has-session -t "${sessionName}" 2>/dev/null`);
        sessionExists = true;
      } else {
        await sshConnectionManager.exec(hostId, `tmux has-session -t "${sessionName}" 2>/dev/null`);
        sessionExists = true;
      }
    } catch {
      throw new Error(`Tmux session "${sessionName}" not found on ${hostId}`);
    }

    // Refresh discovery to pick up the session
    await sessionDiscoveryService.refresh();

    // Find the session in discovery (include hidden sessions)
    const sessions = sessionDiscoveryService.getSessions(true);
    const attachedSession = sessions.find(s =>
      s.tmux.sessionName === sessionName && s.host.id === hostId
    );

    if (!attachedSession) {
      throw new Error(`Session "${sessionName}" exists but could not be discovered`);
    }

    // Unhide if previously hidden
    sessionDiscoveryService.unhideSession(attachedSession.id);

    // Add to managed sessions
    sessionDiscoveryService.addManagedSession(attachedSession.id);

    return attachedSession;
  }

  async killSession(sessionId: string): Promise<void> {
    const session = sessionDiscoveryService.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      if (session.host.id === 'local') {
        await exec(`tmux kill-session -t "${session.tmux.sessionName}"`);
      } else {
        await sshConnectionManager.exec(
          session.host.id,
          `tmux kill-session -t "${session.tmux.sessionName}"`
        );
      }
    } catch (err) {
      throw new Error(`Failed to kill session: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Remove from managed sessions
    sessionDiscoveryService.removeManagedSession(sessionId);

    // Refresh discovery
    await sessionDiscoveryService.refresh();
  }

  async killPane(sessionId: string): Promise<void> {
    const session = sessionDiscoveryService.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      if (session.host.id === 'local') {
        await exec(`tmux kill-pane -t "${session.tmux.sessionName}:${session.tmux.paneId}"`);
      } else {
        await sshConnectionManager.exec(
          session.host.id,
          `tmux kill-pane -t "${session.tmux.sessionName}:${session.tmux.paneId}"`
        );
      }
    } catch (err) {
      throw new Error(`Failed to kill pane: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Remove from managed sessions
    sessionDiscoveryService.removeManagedSession(sessionId);

    await sessionDiscoveryService.refresh();
  }
}

export const sessionManager = new SessionManager();
