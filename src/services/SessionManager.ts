import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { Session, CreateSessionRequest, AttachSessionRequest } from '../types/Session.js';
import { sessionDiscoveryService } from './SessionDiscoveryService.js';
import { sshConnectionManager } from './SSHConnectionManager.js';

const exec = promisify(execCallback);

export class SessionManager {

  async createSession(request: CreateSessionRequest): Promise<Session> {
    const { workingDirectory: inputWorkingDir, hostId, sessionName, claudeArgs = [], workspaceId } = request;

    // Default to home directory if not provided
    const workingDirectory = inputWorkingDir?.trim() || '~';

    // Generate session name if not provided
    const tmuxSessionName = sessionName || `claude-${Date.now()}`;

    // Build claude command
    const claudeCmd = ['claude', ...claudeArgs].join(' ');

    if (hostId === 'local') {
      // Local session creation
      // Validate working directory (skip for home directory shortcut)
      if (workingDirectory !== '~') {
        try {
          await exec(`test -d "${workingDirectory}"`);
        } catch {
          throw new Error(`Working directory does not exist: ${workingDirectory}`);
        }
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
      // Validate working directory exists remotely (skip for home directory shortcut)
      if (workingDirectory !== '~') {
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
      }

      // Create tmux session remotely
      try {
        // First, check if claude command exists on remote host (check for path starting with /)
        const whichClaude = await sshConnectionManager.exec(hostId, `which claude 2>/dev/null || echo 'NOT_FOUND'`);
        const claudePath = whichClaude.trim();
        console.log(`[SessionManager] Claude on ${hostId}: ${claudePath}`);

        if (!claudePath.startsWith('/')) {
          throw new Error(`Claude command not found on remote host ${hostId}. Please ensure Claude is installed and in PATH.`);
        }

        // Check if tmux is installed (check for path starting with /)
        const whichTmux = await sshConnectionManager.exec(hostId, `which tmux 2>/dev/null || echo 'NOT_FOUND'`);
        const tmuxPath = whichTmux.trim();
        console.log(`[SessionManager] tmux on ${hostId}: ${tmuxPath}`);

        if (!tmuxPath.startsWith('/')) {
          throw new Error(`tmux not found on remote host ${hostId}. Please install tmux first.`);
        }

        const createCmd = `tmux new-session -d -s "${tmuxSessionName}" -c "${workingDirectory}" "${claudeCmd}"`;
        console.log(`[SessionManager] Creating remote session: ${createCmd}`);
        const createOutput = await sshConnectionManager.exec(hostId, `${createCmd} 2>&1; echo "EXIT_CODE:$?"`);
        console.log(`[SessionManager] Create output: ${createOutput.trim()}`);

        // Check if session was actually created
        if (createOutput.includes('command not found') || createOutput.includes('not found')) {
          throw new Error(`Failed to create session: ${createOutput.trim()}`);
        }

        // Verify session exists
        const verifyOutput = await sshConnectionManager.exec(hostId, `tmux list-sessions -F '#{session_name}' 2>/dev/null || echo 'NO_SESSIONS'`);
        console.log(`[SessionManager] Remote sessions after create: ${verifyOutput.trim()}`);
      } catch (err) {
        throw new Error(`Failed to create remote tmux session: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Wait a moment for session to start, then refresh discovery
    // Remote sessions may take longer to start
    const waitTime = hostId === 'local' ? 500 : 1500;
    await new Promise(resolve => setTimeout(resolve, waitTime));
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
