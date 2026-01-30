import { Session } from './Session.js';

// Client -> Server messages
export interface SubscribeMessage {
  type: 'subscribe';
  sessionId: string;
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  sessionId: string;
}

export interface InputMessage {
  type: 'input';
  sessionId: string;
  data: string;
}

export interface ResizeMessage {
  type: 'resize';
  sessionId: string;
  cols: number;
  rows: number;
}

export interface ListSessionsMessage {
  type: 'list-sessions';
}

export interface AuthRefreshMessage {
  type: 'auth-refresh';
  token: string;
}

export type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | InputMessage
  | ResizeMessage
  | ListSessionsMessage
  | AuthRefreshMessage;

// Server -> Client messages
export interface SessionsMessage {
  type: 'sessions';
  sessions: Session[];
}

export interface OutputMessage {
  type: 'output';
  sessionId: string;
  data: string;
}

export interface SessionAddedMessage {
  type: 'session-added';
  session: Session;
}

export interface SessionRemovedMessage {
  type: 'session-removed';
  sessionId: string;
}

export interface SessionUpdatedMessage {
  type: 'session-updated';
  session: Session;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
}

export interface AuthExpiredMessage {
  type: 'auth-expired';
}

export interface BufferMessage {
  type: 'buffer';
  sessionId: string;
  data: string[];
}

export type ServerMessage =
  | SessionsMessage
  | OutputMessage
  | SessionAddedMessage
  | SessionRemovedMessage
  | SessionUpdatedMessage
  | ErrorMessage
  | AuthExpiredMessage
  | BufferMessage;
