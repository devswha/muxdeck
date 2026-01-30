import { createContext, useContext, useCallback, useRef, ReactNode, useMemo } from 'react';
import { useSessions } from '../hooks/useSessions';
import { useWebSocket, ConnectionStatus } from '../hooks/useWebSocket';
import { Session, ServerMessage } from '../types/Session';
import * as PersistenceService from '../services/PersistenceService';
import { HistoryEntry } from '../services/PersistenceService';

interface TerminalWriter {
  write: (data: string) => void;
  writeln: (data: string) => void;
}

interface SessionContextValue {
  sessions: Session[];
  claudeSessions: Session[];
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  selectedSessionId: string | null;
  selectSession: (sessionId: string | null) => void;
  subscribeToSession: (sessionId: string) => void;
  unsubscribeFromSession: (sessionId: string) => void;
  sendInput: (sessionId: string, data: string) => void;
  resize: (sessionId: string, cols: number, rows: number) => void;
  registerTerminal: (sessionId: string, writer: TerminalWriter) => void;
  unregisterTerminal: (sessionId: string) => void;
  // Favorites
  toggleFavorite: (sessionId: string) => void;
  isFavorite: (sessionId: string) => boolean;
  // History
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  sessionHistory: HistoryEntry[];
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const {
    sessions,
    loading,
    error,
    updateSessions,
    setError,
    getClaudeSessions,
    showHistory,
    setShowHistory,
    toggleFavorite,
    isFavorite,
  } = useSessions();

  const terminalWritersRef = useRef<Map<string, TerminalWriter>>(new Map());
  const selectedSessionIdRef = useRef<string | null>(null);

  const handleMessage = useCallback((data: unknown) => {
    const message = data as ServerMessage;
    switch (message.type) {
      case 'sessions':
        if ('sessions' in message) {
          updateSessions(message.sessions);
        }
        break;

      case 'output': {
        if ('sessionId' in message && 'data' in message) {
          const writer = terminalWritersRef.current.get(message.sessionId);
          if (writer) {
            writer.write(message.data);
          }
        }
        break;
      }

      case 'buffer': {
        if ('sessionId' in message && 'data' in message) {
          const writer = terminalWritersRef.current.get(message.sessionId);
          if (writer) {
            message.data.forEach((line: string) => writer.write(line));
          }
        }
        break;
      }

      case 'error':
        if ('message' in message) {
          setError(message.message);
        }
        break;
    }
  }, [updateSessions, setError]);

  // Determine WebSocket URL
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isDev = import.meta.env.DEV;

  const wsHost = isDev && !isLocalhost
    ? `${hostname}:3000`
    : window.location.host;
  const wsUrl = `${wsProtocol}//${wsHost}/ws`;

  const {
    status: connectionStatus,
    subscribe,
    unsubscribe,
    sendInput: wsSendInput,
    resize: wsResize,
  } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onConnect: () => console.log('Connected to server'),
    onDisconnect: () => console.log('Disconnected from server'),
  });

  const selectSession = useCallback((sessionId: string | null) => {
    selectedSessionIdRef.current = sessionId;
  }, []);

  const subscribeToSession = useCallback((sessionId: string) => {
    subscribe(sessionId);
  }, [subscribe]);

  const unsubscribeFromSession = useCallback((sessionId: string) => {
    unsubscribe(sessionId);
  }, [unsubscribe]);

  const sendInput = useCallback((sessionId: string, data: string) => {
    wsSendInput(sessionId, data);
  }, [wsSendInput]);

  const resize = useCallback((sessionId: string, cols: number, rows: number) => {
    wsResize(sessionId, cols, rows);
  }, [wsResize]);

  const registerTerminal = useCallback((sessionId: string, writer: TerminalWriter) => {
    terminalWritersRef.current.set(sessionId, writer);
  }, []);

  const unregisterTerminal = useCallback((sessionId: string) => {
    terminalWritersRef.current.delete(sessionId);
  }, []);

  const sessionHistory = useMemo(() => PersistenceService.getSessionHistory(), [sessions]);

  const value: SessionContextValue = {
    sessions,
    claudeSessions: getClaudeSessions(),
    loading,
    error,
    connectionStatus,
    selectedSessionId: selectedSessionIdRef.current,
    selectSession,
    subscribeToSession,
    unsubscribeFromSession,
    sendInput,
    resize,
    registerTerminal,
    unregisterTerminal,
    toggleFavorite,
    isFavorite,
    showHistory,
    setShowHistory,
    sessionHistory,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
