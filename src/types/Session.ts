/** Represents the connection status of a session */
export type SessionStatus =
  | 'active'
  | 'idle'
  | 'disconnected'
  | 'terminated';

/** Host types for session location */
export type HostType = 'local' | 'remote';

/** Host information */
export interface SessionHost {
  id: string;
  type: HostType;
  displayName: string;
}

/** tmux-specific identifiers */
export interface TmuxInfo {
  sessionId: string;
  sessionName: string;
  paneId: string;
  windowIndex: number;
}

/** Process information */
export interface ProcessInfo {
  pid: number;
  currentCommand: string;
}

/** Terminal dimensions */
export interface Dimensions {
  cols: number;
  rows: number;
}

/** Complete Session interface */
export interface Session {
  id: string;
  name: string;
  host: SessionHost;
  tmux: TmuxInfo;
  status: SessionStatus;
  isClaudeSession: boolean;
  process: ProcessInfo;
  createdAt: string;
  lastActivityAt: string;
  dimensions: Dimensions;
  workingDirectory: string | null;
  workspaceId: string | null;
}

/** Session creation request */
export interface CreateSessionRequest {
  workingDirectory: string;
  hostId: string;
  sessionName?: string;
  claudeArgs?: string[];
  workspaceId?: string;
}

/** Session attach request */
export interface AttachSessionRequest {
  sessionName: string;
  hostId: string;
  workspaceId?: string;
}

/** Session creation response */
export interface CreateSessionResponse {
  session: Session;
}
