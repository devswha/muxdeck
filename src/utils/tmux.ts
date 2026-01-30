import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

// Use a simple multi-character delimiter that won't have shell escaping issues
// Export delimiter for use in remote discovery
export const DELIMITER = '|||';

export interface TmuxSession {
  sessionId: string;
  sessionName: string;
  windowCount: number;
  createdAt: number;
}

export interface TmuxPane {
  paneId: string;
  pid: number;
  currentCommand: string;
  width: number;
  height: number;
  windowIndex: number;
  currentPath: string;
}

export async function listTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const format = `#{session_id}${DELIMITER}#{session_name}${DELIMITER}#{session_windows}${DELIMITER}#{session_created}`;
    const { stdout } = await exec(`tmux list-sessions -F '${format}' 2>/dev/null || true`);

    if (!stdout.trim()) return [];

    return stdout.trim().split('\n').map(line => {
      const [sessionId, sessionName, windowCount, createdAt] = line.split(DELIMITER);
      return {
        sessionId,
        sessionName,
        windowCount: parseInt(windowCount, 10),
        createdAt: parseInt(createdAt, 10),
      };
    });
  } catch {
    return [];
  }
}

export async function listTmuxPanes(sessionName: string): Promise<TmuxPane[]> {
  try {
    const format = `#{pane_id}${DELIMITER}#{pane_pid}${DELIMITER}#{pane_current_command}${DELIMITER}#{pane_width}${DELIMITER}#{pane_height}${DELIMITER}#{window_index}${DELIMITER}#{pane_current_path}`;
    const { stdout } = await exec(`tmux list-panes -t '${sessionName}' -F '${format}' 2>/dev/null || true`);

    if (!stdout.trim()) return [];

    return stdout.trim().split('\n').map(line => {
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
  } catch {
    return [];
  }
}

/** Primary detection: exact command match */
export function isClaudeSessionFast(pane: TmuxPane): boolean {
  const cmd = pane.currentCommand.toLowerCase();
  // Primary: exact match
  if (cmd === 'claude') return true;
  // Secondary: starts with claude
  if (/^claude(\s|$)/.test(cmd)) return true;
  return false;
}

/** Tertiary detection: check process tree (slower, more comprehensive) */
export async function isClaudeSessionDeep(pane: TmuxPane): Promise<boolean> {
  if (isClaudeSessionFast(pane)) return true;

  try {
    const { stdout } = await exec(`pgrep -P ${pane.pid} -a 2>/dev/null || true`);
    return /\bclaude\b/i.test(stdout);
  } catch {
    return false;
  }
}
