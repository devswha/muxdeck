# Context Directory

<!-- Parent: ../AGENTS.md -->

React Context providers for centralized state management of session and terminal I/O operations.

## Overview

This directory contains the `SessionContext` provider that manages:
- Session state and synchronization with the backend
- WebSocket connection lifecycle and message handling
- Terminal registration and I/O routing
- Session favorites and history
- Selection state for the currently viewed session

**Architecture Pattern:** Context + Custom Hook (useSessionContext). Backend synchronization via WebSocket with automatic reconnection using exponential backoff.

## Files

### SessionContext.tsx

The main context provider for session management. Bridges backend WebSocket communication with React component tree.

#### Purpose

Centralizes session state management and WebSocket I/O routing. Provides a clean API for components to:
1. Access the list of sessions and connection status
2. Subscribe/unsubscribe from session updates
3. Send terminal input and resize signals
4. Register terminal output handlers
5. Manage favorites and history

#### Key Components

**Context Value (SessionContextValue)**

```typescript
interface SessionContextValue {
  // Session State
  sessions: Session[];                              // All active sessions
  claudeSessions: Session[];                        // Filtered Claude sessions only
  loading: boolean;                                 // Initial load state
  error: string | null;                             // Backend error messages
  connectionStatus: ConnectionStatus;               // 'connecting' | 'connected' | 'disconnected' | 'error'
  
  // Selection
  selectedSessionId: string | null;                 // Currently selected session
  selectSession: (sessionId: string | null) => void;
  
  // Subscriptions (for receiving updates)
  subscribeToSession: (sessionId: string) => void;
  unsubscribeFromSession: (sessionId: string) => void;
  
  // Terminal I/O
  sendInput: (sessionId: string, data: string) => void;
  resize: (sessionId: string, cols: number, rows: number) => void;
  registerTerminal: (sessionId: string, writer: TerminalWriter) => void;
  unregisterTerminal: (sessionId: string) => void;
  
  // Favorites & History
  toggleFavorite: (sessionId: string) => void;
  isFavorite: (sessionId: string) => boolean;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  sessionHistory: HistoryEntry[];
}
```

**Terminal Writer Interface**

```typescript
interface TerminalWriter {
  write: (data: string) => void;           // Write raw data to terminal
  writeln: (data: string) => void;         // Write data with newline
}
```

#### Core Behaviors

**Message Handling (handleMessage)**

Routes server messages to appropriate handlers:

| Message Type | Handler | Description |
|---|---|---|
| `'sessions'` | `updateSessions()` | Session list updates from backend |
| `'output'` | Terminal writer | Individual session output |
| `'buffer'` | Terminal writer | Bulk session output (line array) |
| `'error'` | `setError()` | Backend error messages |

**WebSocket URL Resolution**

Intelligently determines WebSocket endpoint:
- Uses HTTPS/WSS in production
- Uses HTTP/WS in development
- Detects localhost vs. dev machine hostname
- Falls back to current window location if localhost

```typescript
// Example: 
// Production: wss://example.com/ws
// Dev (localhost): ws://localhost:5173/ws
// Dev (remote): ws://example.com:3000/ws
```

**Terminal I/O Routing**

Terminal writers are registered and stored in a Map for session-specific I/O:
- Components register a terminal writer for a session
- Incoming `'output'` messages find the writer and call `write(data)`
- `'buffer'` messages iterate lines and write each one
- Unregister when components unmount

**WebSocket Lifecycle with Reconnection**

Uses `useWebSocket` hook which provides:
- Exponential backoff reconnection (1s → 2s → 4s → ... → 30s max)
- Jitter to prevent thundering herd
- Message queueing during disconnection
- Automatic re-subscription after reconnect
- Callback refs to prevent reconnection on prop changes

#### Integration Points

**Upstream Dependencies**
- `useSessions()` hook: Session state management, favorites, history
- `useWebSocket()` hook: WebSocket connection and message sending
- `PersistenceService`: Favorites and history storage

**Downstream Usage**
- Components consume via `useSessionContext()` hook
- WebSocket URL determined by `import.meta.env.DEV` (Vite dev flag)

#### Data Flow

```
Backend
   ↓
WebSocket (useWebSocket)
   ↓
handleMessage()
   ├─→ 'sessions' → updateSessions() → setState
   ├─→ 'output' → terminalWritersRef.get(sessionId).write()
   ├─→ 'buffer' → terminalWritersRef.get(sessionId).write(lines)
   └─→ 'error' → setError()
   ↓
React Context (SessionContextValue)
   ↓
Components (via useSessionContext)
```

#### Memory Management

- `terminalWritersRef`: Maps session IDs to terminal writer callbacks. Cleaned up in `unregisterTerminal()`.
- `selectedSessionIdRef`: Lightweight ref for selection state, doesn't trigger re-renders.
- `sessionHistory`: Computed from `useSessions()` sessions list via `useMemo`.

#### Error Handling

- WebSocket errors: Status becomes `'error'`, logged to console
- Malformed messages: Logged, ignored (graceful degradation)
- Missing terminal writers: Silently ignored (output discarded)
- Missing context: `useSessionContext()` throws clear error message

## Custom Hook: useSessionContext

```typescript
export function useSessionContext(): SessionContextValue
```

Safely extracts the session context. Must be called within a `SessionProvider`.

**Error Behavior**

Throws if used outside provider:
```
Error: useSessionContext must be used within a SessionProvider
```

**Usage Example**

```typescript
function MyComponent() {
  const { sessions, connectionStatus, sendInput } = useSessionContext();
  
  return (
    <div>
      <p>Connection: {connectionStatus}</p>
      {sessions.map(s => <div key={s.id}>{s.name}</div>)}
    </div>
  );
}
```

## Provider Setup

Wrap the app or relevant tree with `SessionProvider`:

```typescript
import { SessionProvider } from './context/SessionContext';

function App() {
  return (
    <SessionProvider>
      <MainContent />
    </SessionProvider>
  );
}
```

## WebSocket Protocol

The context delegates WebSocket protocol details to `useWebSocket`, which handles:

**Outbound Messages**
- `{ type: 'subscribe', sessionId }` - Start receiving session updates
- `{ type: 'unsubscribe', sessionId }` - Stop receiving session updates
- `{ type: 'input', sessionId, data }` - Send terminal input
- `{ type: 'resize', sessionId, cols, rows }` - Resize session

**Inbound Messages**
- `{ type: 'sessions', sessions: Session[] }` - Full session list
- `{ type: 'output', sessionId, data: string }` - Session output
- `{ type: 'buffer', sessionId, data: string[] }` - Bulk output
- `{ type: 'error', message, code? }` - Error notification

See `types/Session.ts` for full message type definitions.

## Common Patterns

### Displaying a List of Sessions

```typescript
function SessionList() {
  const { sessions, selectedSessionId, selectSession } = useSessionContext();
  
  return (
    <ul>
      {sessions.map(s => (
        <li
          key={s.id}
          className={selectedSessionId === s.id ? 'selected' : ''}
          onClick={() => selectSession(s.id)}
        >
          {s.name}
        </li>
      ))}
    </ul>
  );
}
```

### Subscribing to a Session

```typescript
function SessionViewer({ sessionId }: { sessionId: string }) {
  const { subscribeToSession, unsubscribeFromSession } = useSessionContext();
  
  useEffect(() => {
    subscribeToSession(sessionId);
    return () => unsubscribeFromSession(sessionId);
  }, [sessionId, subscribeToSession, unsubscribeFromSession]);
  
  return <Terminal sessionId={sessionId} />;
}
```

### Registering a Terminal

```typescript
function Terminal({ sessionId }: { sessionId: string }) {
  const { registerTerminal, unregisterTerminal, sendInput } = useSessionContext();
  const terminalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const writer: TerminalWriter = {
      write: (data) => {
        // Append to xterm or similar
      },
      writeln: (data) => {
        // Append with newline
      }
    };
    
    registerTerminal(sessionId, writer);
    return () => unregisterTerminal(sessionId);
  }, [sessionId, registerTerminal, unregisterTerminal]);
  
  const handleInput = (data: string) => {
    sendInput(sessionId, data);
  };
  
  return <div ref={terminalRef} onInput={handleInput} />;
}
```

### Toggling Favorites

```typescript
function SessionCard({ session }: { session: Session }) {
  const { isFavorite, toggleFavorite } = useSessionContext();
  
  return (
    <div>
      <span>{session.name}</span>
      <button
        className={isFavorite(session.id) ? 'favorite' : 'not-favorite'}
        onClick={() => toggleFavorite(session.id)}
      >
        ★
      </button>
    </div>
  );
}
```

## Related Files

- `useSessions()` (../hooks/useSessions.ts) - Session state, favorites, history
- `useWebSocket()` (../hooks/useWebSocket.ts) - WebSocket connection management
- `Session` type (../types/Session.ts) - Session data model
- `PersistenceService` (../services/PersistenceService.ts) - Local storage

## Debugging

**Check Connection Status**

```typescript
const { connectionStatus } = useSessionContext();
console.log(connectionStatus); // 'connecting' | 'connected' | 'disconnected' | 'error'
```

**Verify Terminal Writers**

Terminal output not appearing? Check:
1. Terminal is registered: `registerTerminal()` was called
2. Session is subscribed: `subscribeToSession()` was called
3. Writer callbacks are defined: `write()` and `writeln()` exist
4. Session ID matches: Output message sessionId matches registered sessionId

**WebSocket Reconnection**

The `useWebSocket` hook logs reconnection attempts:
```
Connected to server
Disconnected from server
Reconnecting in 1342ms...
```

Check browser console for these logs if connection seems unstable.

**Error Messages**

Backend errors appear in context:
```typescript
const { error } = useSessionContext();
if (error) console.error(error);
```

Clear the error by updating sessions or checking backend logs.
