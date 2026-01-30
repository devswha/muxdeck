export type SessionStatus = 'active' | 'idle' | 'disconnected' | 'terminated';
export type HostType = 'local' | 'remote';

export interface SessionHost {
  id: string;
  type: HostType;
  displayName: string;
}

export interface TmuxInfo {
  sessionId: string;
  sessionName: string;
  paneId: string;
  windowIndex: number;
}

export interface ProcessInfo {
  pid: number;
  currentCommand: string;
}

export interface Dimensions {
  cols: number;
  rows: number;
}

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

// Protocol types
export interface SessionsMessage {
  type: 'sessions';
  sessions: Session[];
}

export interface OutputMessage {
  type: 'output';
  sessionId: string;
  data: string;
}

export interface BufferMessage {
  type: 'buffer';
  sessionId: string;
  data: string[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export type ServerMessage = SessionsMessage | OutputMessage | BufferMessage | ErrorMessage | { type: string };
