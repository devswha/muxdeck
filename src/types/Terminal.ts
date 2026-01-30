/** Terminal bridge state */
export type BridgeState =
  | 'initializing'
  | 'connected'
  | 'paused'
  | 'error'
  | 'closed';

/** Terminal bridge - manages PTY connection to a session */
export interface TerminalBridgeInfo {
  id: string;
  sessionId: string;
  state: BridgeState;
  dimensions: {
    cols: number;
    rows: number;
  };
  subscriberCount: number;
  lastError?: string;
  lastActivityAt: Date;
}

/** Configuration for creating a terminal bridge */
export interface BridgeConfig {
  sessionId: string;
  tmuxTarget: string;  // tmux session:pane target
  cols: number;
  rows: number;
  readOnly?: boolean;
}
