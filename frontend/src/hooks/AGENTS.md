<!-- Parent: ../AGENTS.md -->

# Custom React Hooks

Collection of reusable stateful logic encapsulated as custom hooks for the Session Manager frontend. Each hook follows React conventions with the `use` prefix and manages specific application concerns.

---

## Overview

| Hook | Purpose | State | Side Effects |
|------|---------|-------|--------------|
| `useWebSocket` | WebSocket connection lifecycle and message routing | Connection status, pending messages, subscriptions | Opens/closes WS, auto-reconnect, message queuing |
| `useTerminal` | xterm.js terminal initialization and control | Terminal ref, fit addon ref, container ref | Creates terminal DOM, loads addons, observes resize |
| `useSessions` | Session state and favorites management | Sessions array, loading/error, favorites set | Persists favorites/history to localStorage |
| `useDragAndDrop` | Drag-and-drop state for session workspace organization | Dragging session ID, drag-over workspace ID | Visual feedback during drag operations |

---

## useWebSocket.ts

Manages the complete WebSocket lifecycle with automatic reconnection, message queuing, and per-session subscriptions.

### Signature

```typescript
export function useWebSocket({
  url: string
  onMessage: (data: unknown) => void
  onConnect?: () => void
  onDisconnect?: () => void
  reconnect?: boolean
}): {
  status: ConnectionStatus
  send: (data: object) => void
  subscribe: (sessionId: string) => void
  unsubscribe: (sessionId: string) => void
  sendInput: (sessionId: string, data: string) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  connect: () => void
  disconnect: () => void
}
```

### State Management

- **status**: `'connecting' | 'connected' | 'disconnected' | 'error'` - Current connection state
- **wsRef**: WebSocket instance ref (direct DOM access, persists across renders)
- **pendingMessagesRef**: Queue of messages to send when reconnected
- **subscribedSessionsRef**: Set of session IDs to re-subscribe on reconnect
- **reconnectAttemptRef**: Counter for exponential backoff calculation
- **reconnectTimeoutRef**: Handle for clearing reconnection timeout on unmount

### Core Features

#### 1. Connection Management
- Establishes WebSocket connection on mount
- Closes connection and clears timeouts on unmount
- Prevents duplicate connections (checks `readyState`)
- Transitions through states: `disconnected` → `connecting` → `connected`

#### 2. Automatic Reconnection
- Exponential backoff with jitter: `delay = min(1000 × 2^attempt, 30000)`
- Jitter formula: ±20% of calculated delay
- Resets attempt counter on successful connection
- Skipped if `reconnect` prop is `false`
- Auto-cleanup: timeout cleared on unmount

#### 3. Message Queuing
- Queues outbound messages when disconnected
- Flushes queue on reconnection (FIFO order)
- Maintains message order during network interruptions
- Critical for input buffering during disconnections

#### 4. Session Subscriptions
- Tracks subscribed session IDs in Set
- Re-subscribes all sessions on reconnection
- Sends `subscribe`/`unsubscribe` messages to server
- Enables per-session message filtering on backend

#### 5. Callback Stability
- Uses refs for `onMessage`, `onConnect`, `onDisconnect` callbacks
- Prevents unnecessary reconnections on callback changes
- Decouples callback updates from connection lifecycle

### Usage Example

```typescript
const { status, subscribe, sendInput, resize } = useWebSocket({
  url: 'ws://localhost:3000/ws',
  onMessage: (data) => {
    console.log('Received:', data);
  },
  onConnect: () => {
    console.log('Connected to server');
  },
  onDisconnect: () => {
    console.log('Disconnected from server');
  },
  reconnect: true,
});

// Subscribe to a session
subscribe('session-id-123');

// Send terminal input
sendInput('session-id-123', 'ls -la\n');

// Resize terminal
resize('session-id-123', 120, 40);

// Check status
if (status === 'connected') {
  // UI shows green indicator
}
```

### Message Protocol

#### Outbound Messages

```typescript
// Subscribe to session output
{ type: 'subscribe', sessionId: string }

// Unsubscribe from session
{ type: 'unsubscribe', sessionId: string }

// Send terminal input
{ type: 'input', sessionId: string, data: string }

// Notify of terminal resize
{ type: 'resize', sessionId: string, cols: number, rows: number }
```

#### Inbound Messages (handled by app, not this hook)

```typescript
// Session list update
{ type: 'sessions', payload: Session[] }

// Terminal output for subscribed session
{ type: 'output', sessionId: string, data: string }

// Session history buffer
{ type: 'buffer', sessionId: string, data: string }

// Error message from server
{ type: 'error', message: string }
```

### Performance Considerations

- **Refs prevent closures**: `onMessageRef.current?.()` avoids capturing stale callbacks
- **Message batching**: Server should batch frequent `output` messages
- **Subscription filtering**: Only subscribed sessions receive output, reducing bandwidth
- **Reconnection backoff**: Prevents hammering server during outages

### Error Handling

- **Parse errors**: Logged to console, processing continues
- **Connection errors**: State set to `'error'`, automatic reconnection attempted
- **Closed connections**: Safe send checks `readyState === WebSocket.OPEN`
- **Messages during reconnect**: Queued in `pendingMessagesRef`

### Integration with SessionContext

SessionContext uses `useWebSocket` to:
1. Receive session list updates via `type: 'sessions'`
2. Receive terminal output via `type: 'output'`
3. Send user input to backend via `sendInput()`
4. Notify backend of terminal resize via `resize()`

---

## useTerminal.ts

Encapsulates xterm.js terminal initialization, lifecycle management, and addon setup.

### Signature

```typescript
export function useTerminal({
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
} = {}): {
  initTerminal: (container: HTMLDivElement) => () => void
  write: (data: string) => void
  writeln: (data: string) => void
  clear: () => void
  fit: () => void
  focus: () => void
  getDimensions: () => { cols: number, rows: number }
  terminalRef: React.MutableRefObject<Terminal | null>
}
```

### State Management

- **terminalRef**: xterm.js Terminal instance
- **fitAddonRef**: FitAddon for responsive sizing
- **containerRef**: DOM container element
- **onDataRef**: Callback when user types (ref prevents closure)
- **onResizeRef**: Callback when terminal resizes (ref prevents closure)

### Core Features

#### 1. Terminal Initialization

**initTerminal(container: HTMLDivElement) → cleanup function**

- Creates new xterm.js Terminal with preconfigured theme
- Loads addons: FitAddon, Unicode11Addon, WebglAddon (with fallback to Canvas)
- Opens terminal into provided container
- Calls `fit()` via `requestAnimationFrame` after container has dimensions
- Sets up event listeners for input and resize

**Returns cleanup function that:**
- Disconnects ResizeObserver
- Disposes terminal (cleanup DOM)
- Clears refs

#### 2. Terminal Theme

Dark theme matching VS Code:
- Background: `#1e1e1e`
- Foreground: `#d4d4d4`
- Cursor: `#d4d4d4`
- Selection: `rgba(255, 255, 255, 0.3)`
- Color palette: Full 256-color support with bright variants

Font: 14px Menlo/Monaco/Courier New, monospace

#### 3. Input Handling

**onData callback:**
- Fires on every keystroke
- Captures user input including special keys
- Prevents default browser behavior (handled by terminal)
- Passed to `onData` prop callback

**Example usage in Terminal.tsx:**
```typescript
const { initTerminal } = useTerminal({
  onData: (data) => {
    // Filter DA responses to prevent feedback loops
    if (!data.match(/\x1b\[[\?>]\d*[a-zA-Z]/)) {
      handleInput(data);
    }
  },
});
```

#### 4. Resize Handling

**ResizeObserver monitors container:**
- Triggers on container dimension changes
- Calls `fit()` to recalculate terminal cols/rows
- Notifies app via `onResize` callback
- Uses container offset dimensions for safe checks

**Data flow:**
```
Container resizes
  → ResizeObserver fires
    → fitAddon.fit() adjusts terminal grid
      → onResize(cols, rows) callback
        → Terminal.tsx calls sendResize() via context
          → WebSocket.resize() sends to backend
            → Backend adjusts tmux window size
```

#### 5. Addon System

**FitAddon**: Responsive sizing
- Calculates available rows/cols based on container size
- Called after initialization and on resize
- Delay via `requestAnimationFrame` ensures CSS has applied

**Unicode11Addon**: Full Unicode support
- Properly renders emoji and special characters
- Required for correct character width calculation

**WebglAddon**: GPU-accelerated rendering
- Significantly faster terminal rendering
- Falls back to Canvas renderer if unavailable (old browsers)
- Try/catch prevents initialization errors

#### 6. Operational Methods

```typescript
write(data: string)           // Write text without newline
writeln(data: string)         // Write text with newline
clear()                       // Clear entire terminal
fit()                         // Recalculate dimensions
focus()                       // Move keyboard focus to terminal
getDimensions()               // Get { cols, rows }
```

### Usage Example

```typescript
const { initTerminal, write, sendResize } = useTerminal({
  onData: (data) => handleInput(data),
  onResize: (cols, rows) => notifyBackendOfResize(cols, rows),
});

// In useEffect:
useEffect(() => {
  if (!containerRef.current) return;
  const cleanup = initTerminal(containerRef.current);
  return cleanup;
}, [initTerminal]);

// Write output from backend
useEffect(() => {
  if (sessionOutput) {
    write(sessionOutput);
  }
}, [sessionOutput, write]);

// JSX
<div ref={containerRef} style={{ height: '400px', width: '100%' }} />
```

### Performance Considerations

- **WebGL rendering**: 10-100x faster than Canvas for large outputs
- **Lazy initialization**: Terminal only created when container mounted
- **Ref-based callbacks**: No closure over stale callback references
- **Observer cleanup**: ResizeObserver disconnected on unmount
- **requestAnimationFrame**: Ensures layout is painted before fit()

### Key Gotchas

1. **Container must have dimensions**: fit() requires `offsetWidth > 0 && offsetHeight > 0`
2. **requestAnimationFrame delay**: Container needs to be laid out by browser before fit()
3. **DA sequence filtering**: Terminal emits `\x1b[?..c` and `\x1b[>..c` in response to Device Attributes queries; must be filtered to prevent feedback loops
4. **WebGL unsupported**: Gracefully falls back to Canvas if WebGL unavailable

### Terminal Escape Sequences (DA Filter)

The app filters Device Attributes responses to prevent infinite loops:

```regex
\x1b\[\?[0-9;]*[a-zA-Z]  // CSI ? ... letter
\x1b\[>[0-9;]*[a-zA-Z]    // CSI > ... letter
```

These are sent by xterm.js when the backend sends `CSI ? c` (query device attributes). Filtering prevents them from being written back to the terminal, which would cause re-queries.

---

## useSessions.ts

Manages session state, loading, error handling, and persistent favorites/history.

### Signature

```typescript
export function useSessions(): {
  sessions: Session[]
  loading: boolean
  error: string | null
  showHistory: boolean
  setShowHistory: (show: boolean) => void
  favorites: Set<string>
  toggleFavorite: (sessionId: string) => void
  isFavorite: (sessionId: string) => boolean
  updateSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  removeSession: (sessionId: string) => void
  updateSession: (session: Session) => void
  getClaudeSessions: () => Session[]
  setLoading: (isLoading: boolean) => void
  setError: (err: string | null) => void
}
```

### State Management

- **sessions**: Array of current sessions
- **loading**: Initial data load in progress
- **error**: API or connection error message
- **showHistory**: Whether to display terminated sessions in UI
- **favorites**: Set of favorite session IDs (initialized from localStorage)

### Core Features

#### 1. Session Updates

**updateSessions(newSessions: Session[])**
- Replaces entire session list
- Saves terminated sessions to history via `PersistenceService.addToHistory()`
- Clears loading state and error

Used by SessionContext when receiving `type: 'sessions'` message from WebSocket.

#### 2. Session Mutations

```typescript
addSession(session: Session)        // Add or replace if exists
removeSession(sessionId: string)    // Remove from list
updateSession(session: Session)     // Replace single session
getClaudeSessions()                 // Filter Claude sessions, exclude terminated
```

#### 3. Favorites Persistence

**toggleFavorite(sessionId: string)**
- Toggles session in favorites Set
- Calls `PersistenceService.addFavorite()` or `removeFavorite()`
- Persists to localStorage immediately

**isFavorite(sessionId: string)**
- Fast lookup via Set membership
- Used by SessionTile to show/hide star icon

#### 4. Loading and Error States

```typescript
setLoading(isLoading: boolean)      // Track data fetch in progress
setError(err: string | null)        // Set error message, clears loading
```

### Usage Pattern

Typically used within **SessionContext** to provide centralized state:

```typescript
// In SessionProvider
const sessionsHook = useSessions();

// On WebSocket message
const handleMessage = (data) => {
  if (data.type === 'sessions') {
    sessionsHook.updateSessions(data.payload);
  }
};

// Expose via context
<SessionContext.Provider value={{ ...sessionsHook, ... }}>
```

### Data Flow

```
WebSocket receives 'sessions' message
  → SessionContext.handleMessage()
    → useSessions.updateSessions(newSessions)
      → setSessions(newSessions)
      → Save terminated sessions to PersistenceService
      → setLoading(false)
      → setError(null)
  → Re-render components consuming SessionContext
    → WorkspaceGrid reads updatedSessions
      → SessionTile rendered for each session
```

### Integration with PersistenceService

- **Favorites**: `getFavorites()` → `addFavorite(id)` → `removeFavorite(id)`
- **History**: `addToHistory(session)` called on session termination
- **Storage**: localStorage key `session-manager-favorites` and `session-manager-history`

---

## useDragAndDrop.ts

Manages drag-and-drop state for moving sessions between workspaces.

### Signature

```typescript
export function useDragAndDrop(): {
  draggingSessionId: string | null
  dragOverWorkspaceId: string | null
  handleDragStart: (sessionId: string) => void
  handleDragEnd: () => void
  handleDragEnter: (workspaceId: string | null) => void
  handleDragLeave: () => void
}
```

### State Management

- **draggingSessionId**: ID of session being dragged (null when not dragging)
- **dragOverWorkspaceId**: ID of workspace cursor is over (null when over no workspace)

### Core Features

#### 1. Drag Start/End Lifecycle

**handleDragStart(sessionId: string)**
- Stores dragging session ID
- UI shows session as semi-transparent
- Used by SessionTile on `onDragStart`

**handleDragEnd()**
- Clears both dragging and dragOver states
- Resets visual feedback
- Called by SessionTile on `onDragEnd`

#### 2. Drop Target Feedback

**handleDragEnter(workspaceId: string | null)**
- Sets current drag-over workspace
- Highlights drop zone in UI
- Called by WorkspaceGrid on `onDragEnter`

**handleDragLeave()**
- Clears drag-over workspace
- Removes highlight on `onDragLeave`

#### 3. Visual Feedback Integration

SessionTile uses draggingSessionId:
```tsx
<div
  className={draggingSessionId === session.id ? 'opacity-50' : 'opacity-100'}
  onDragStart={() => handleDragStart(session.id)}
  onDragEnd={handleDragEnd}
>
  {/* Session content */}
</div>
```

WorkspaceGrid uses dragOverWorkspaceId:
```tsx
<div
  className={dragOverWorkspaceId === workspace.id ? 'bg-blue-500 bg-opacity-20' : ''}
  onDragEnter={() => handleDragEnter(workspace.id)}
  onDragLeave={handleDragLeave}
  onDrop={() => handleSessionDrop(session.id, workspace.id)}
>
  {/* Workspace content */}
</div>
```

### Data Flow

```
User drags SessionTile
  → onDragStart → handleDragStart(sessionId)
    → draggingSessionId = sessionId
    → SessionTile opacity-50

User moves over WorkspaceGrid
  → onDragEnter → handleDragEnter(workspaceId)
    → dragOverWorkspaceId = workspaceId
    → WorkspaceGrid bg-blue-500 highlight

User leaves workspace
  → onDragLeave → handleDragLeave()
    → dragOverWorkspaceId = null
    → Highlight removed

User drops
  → onDrop → handleSessionDrop(sessionId, workspaceId)
    → WorkspaceService.assignSessionToWorkspace(sessionId, workspaceId)
      → Backend updates session.workspaceId
      → Workspaces re-fetched
  → onDragEnd → handleDragEnd()
    → draggingSessionId = null
    → dragOverWorkspaceId = null
    → Visual feedback cleared
```

### Design Pattern

This hook demonstrates a **presentational state pattern**:
- State is isolated (not global, no context provider needed)
- State is scoped to drag operations
- Multiple UI components share state via props
- No business logic (no API calls)
- Pure drag/drop mechanics

### Performance

- **Minimal re-renders**: Only components using specific state updates
- **No context overhead**: Avoids context provider wrapper
- **useCallback memoization**: Handlers are stable references

---

## Common Patterns

### 1. Hook Composition

Hooks often work together:

```typescript
// Terminal.tsx
const { initTerminal, write } = useTerminal({ onData: handleInput });
const { sendInput, status } = useWebSocket({ url });

// useEffect combines both:
useEffect(() => {
  initTerminal(containerRef.current);
  subscribe('session-id');
}, [initTerminal, subscribe]);
```

### 2. Callback Refs Pattern

All hooks use ref-based callbacks to prevent reconnections/reinitializations:

```typescript
const onDataRef = useRef(onData);
useEffect(() => {
  onDataRef.current = onData;
}, [onData]);

const handler = useCallback(() => {
  onDataRef.current?.(value);  // Uses current value, not captured
}, []);
```

This decouples prop changes from effect re-runs.

### 3. Cleanup Functions

Hooks return cleanup that ensures proper resource disposal:

```typescript
useEffect(() => {
  const cleanup = initTerminal(container);
  return cleanup;  // Called on unmount
}, [initTerminal]);

// Cleanup:
// - Disconnects ResizeObserver
// - Disposes terminal
// - Clears refs
```

### 4. State Initialization from External Storage

useSessions initializes favorites from localStorage:

```typescript
const [favorites, setFavorites] = useState<Set<string>>(() =>
  new Set(PersistenceService.getFavorites())
);
```

The initializer function runs once at mount, preventing unnecessary localStorage reads.

---

## Testing Hooks

Each hook can be tested independently using React Testing Library's `renderHook`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

test('connects to WebSocket', () => {
  const { result } = renderHook(() => useWebSocket({
    url: 'ws://localhost',
    onMessage: jest.fn(),
  }));

  expect(result.current.status).toBe('connecting');
});
```

---

## Future Enhancements

1. **useSessionSubscription**: Encapsulate subscribe/unsubscribe/receive pattern
2. **useLocalStorage**: Generic localStorage sync hook
3. **useAsync**: Fetch with loading/error states
4. **useKeyboardShortcuts**: Global keyboard listener
5. **usePrevious**: Track previous prop/state value for diffs

