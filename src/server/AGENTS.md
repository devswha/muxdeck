<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# src/server

HTTP and WebSocket server setup, connection management, and real-time message routing for terminal I/O.

## Purpose

Provides the core real-time communication infrastructure:
- **HTTP Server** - Fastify instance with CORS, auth middleware, and route registration
- **WebSocket Server** - Connection management with heartbeat/ping, client lifecycle, broadcast
- **Message Handler** - WebSocket protocol parsing and routing to terminal services

## Architecture Overview

```
Client (Browser)
      │
      │ HTTP(S)
      ├─────────► Port 3000 ◄─────────┐
      │                               │
      │ WebSocket                     │
      └─────────► /ws ◄───────────────┴─ [HTTP Server (createServer)]
                   │                        │
                   ▼                        │
        ┌──────────────────────┐           │
        │  WebSocketServer     │           │
        │  (WSServer)          │           │
        │                      │           │
        │  • initialize()      │           │
        │  • on:connection     │           │
        │  • heartbeat ping    │◄──────────│ app.ready()
        │  • broadcast()       │           │
        └──────────────────────┘           │
                   │                        │
                   ▼                        │
        ┌──────────────────────┐           │
        │  MessageHandler      │           │
        │                      │           │
        │  • handleConnection()│           │
        │  • handleMessage()   │           │
        │  • handleSubscribe() │           │
        │  • handleInput()     │           │
        │  • broadcast()       │           │
        └──────────────────────┘           │
                   │                        │
         ┌─────────┼─────────┐             │
         │         │         │             │
         ▼         ▼         ▼             │
    TerminalBridge    SessionDiscovery   AuthMiddleware
    (TerminalBridge)   (SessionDiscovery)
```

**Message Flow:**

1. **Client connects** → `WebSocketServer.on:connection` → `MessageHandler.handleConnection()`
2. **Client sends message** → `WebSocketServer.on:message` → `MessageHandler.handleMessage()`
3. **Terminal I/O arrives** → `TerminalBridgeManager.setOutputHandler()` → `MessageHandler.broadcastToSubscribers()`
4. **Session list changes** → `SessionDiscoveryService.onSessionsChange()` → `MessageHandler.broadcastToAll()`

## Key Files

| File | Role | Responsibility |
|------|------|-----------------|
| **app.ts** | HTTP Server Setup | Fastify app creation, CORS config, route registration, error handling, HTTP server creation |
| **WebSocketServer.ts** | Connection Manager | WebSocket server lifecycle, client management, heartbeat, broadcast infrastructure |
| **MessageHandler.ts** | Protocol Router | WebSocket protocol parsing, subscription tracking, message type dispatch, terminal I/O bridging |

## Detailed Breakdown

### app.ts

**Creates and configures the Fastify HTTP server.**

#### Functions

| Function | Input | Output | Role |
|----------|-------|--------|------|
| `createApp()` | - | `FastifyInstance` | Creates Fastify app with CORS, auth middleware, routes, and error handler |
| `startServer(port?)` | `port: number` | `Promise<void>` | Starts HTTP server, initializes WebSocket, begins session polling |

#### CORS Configuration

Allows requests from:
- `http://localhost:5174` - Development frontend
- `http://localhost:5176` - Alternative dev port
- `http://127.0.0.1:5174` - Loopback variants
- `http://100.98.23.106:5175-5176` - Network interface (tailscale?)
- `http://172.19.133.25:5176` - Docker network

Methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
Headers: `Content-Type`, `Authorization`
Credentials: Enabled

#### Routes Registered

1. **GET /** - Root info endpoint (returns service metadata)
2. **GET /health** - Health check
3. **POST/GET /api/auth/\*** - Authentication routes
4. **GET/POST/PUT/DELETE /api/workspaces/\*** - Workspace CRUD
5. **GET/POST/DELETE /api/sessions/\*** - Session discovery/create/attach/delete
6. **GET/POST/DELETE /api/hosts/\*** - Host configuration
7. **GET/POST/DELETE /api/todos/\*** - Todo items
8. **GET/POST/DELETE /api/backlog/\*** - Feature backlog
9. **WebSocket /ws** - Real-time terminal connection (initialized separately)

#### Initialization Sequence

```typescript
createApp()
  ├─ Fastify({ logger: true })
  ├─ register(cors)
  ├─ addHook('preHandler', authMiddleware)
  ├─ register routes (auth, workspaces, sessions, hosts, todos, backlog)
  └─ setErrorHandler()

startServer(port)
  ├─ createApp()
  ├─ app.ready()
  ├─ createServer() ← Node HTTP server wrapping Fastify routing
  ├─ webSocketServer.initialize(httpServer) ← Attach WebSocket to HTTP
  ├─ sessionDiscoveryService.startPolling() ← Begin session discovery
  └─ httpServer.listen(port, host) ← Start listening
```

#### Error Handling

Global error handler logs all errors and returns:
```json
{
  "error": "error message",
  "code": "error.code || INTERNAL_ERROR"
}
```

### WebSocketServer.ts

**Manages WebSocket server connections, client lifecycle, and broadcast infrastructure.**

#### Class: WebSocketServerManager

Private state:
- `wss: WSServer | null` - The ws library WebSocketServer instance
- `pingInterval: NodeJS.Timeout | null` - Heartbeat interval for dead connection detection

#### Methods

| Method | Input | Output | Role |
|--------|-------|--------|------|
| `initialize(server)` | Node `http.Server` | `void` | Create WSServer, set up event handlers, start heartbeat |
| `broadcast(message)` | `object` | `void` | Send message to all connected clients |
| `getConnectionCount()` | - | `number` | Return current client count |

#### Event Handlers

**On connection:**
```typescript
extWs.clientId = randomUUID()        // Unique identifier
extWs.isAlive = true                 // Heartbeat flag
messageHandler.handleConnection(ws, clientId)
```

**On message:**
```typescript
JSON.parse(data)  // Parse JSON message
messageHandler.handleMessage(ws, clientId, message)  // Route to handler
// On parse error: send error message
```

**On close:**
```typescript
messageHandler.handleDisconnection(ws, clientId)  // Clean up subscriptions
```

**On error:**
```typescript
console.error()  // Log but continue
```

#### Heartbeat Protocol (30-second interval)

Detects dead connections by requiring pong response:

```typescript
// Every 30 seconds:
for each client:
  if !isAlive:
    terminate()  // Dead connection
  else:
    isAlive = false
    ping()  // Send ping

// Client receives ping → sends pong → isAlive = true
```

This prevents zombie connections from accumulating.

#### Extended WebSocket Interface

```typescript
interface ExtendedWebSocket extends WebSocket {
  clientId: string;        // UUID for subscription tracking
  isAlive: boolean;        // Heartbeat flag
}
```

#### Singleton Export

```typescript
export const webSocketServer = new WebSocketServerManager();
```

Used globally via `webSocketServer.initialize()` and broadcast operations.

### MessageHandler.ts

**Routes WebSocket messages to appropriate handlers and manages subscription state.**

#### Class: MessageHandler

Private state:
- `clientSubscriptions: Map<WebSocket, Set<string>>` - Maps each client to subscribed session IDs

#### Constructor

Sets up two global event listeners:

1. **Terminal output handler** - From `TerminalBridgeManager`
   ```typescript
   terminalBridgeManager.setOutputHandler((sessionId, data) => {
     broadcastToSubscribers(sessionId, {
       type: 'output',
       sessionId,
       data
     })
   })
   ```
   This pipes real-time terminal output to subscribed clients.

2. **Session list change handler** - From `SessionDiscoveryService`
   ```typescript
   sessionDiscoveryService.onSessionsChange((sessions) => {
     broadcastToAll({
       type: 'sessions',
       sessions
     })
   })
   ```
   This broadcasts updated session list to all clients when discovery detects changes.

#### Public Methods

| Method | Input | Output | Role |
|--------|-------|--------|------|
| `handleConnection(ws, clientId)` | WebSocket, string | `void` | Create subscription set, send initial session list |
| `handleDisconnection(ws, clientId)` | WebSocket, string | `void` | Unsubscribe from all sessions, remove subscription tracking |
| `handleMessage(ws, clientId, message)` | WebSocket, string, `ClientMessage` | `Promise<void>` | Parse message type and dispatch to handler |
| `broadcastToAll(message)` | `ServerMessage` | `void` | Send message to all connected clients |

#### Message Type Handlers

| Message Type | Handler | Action |
|--------------|---------|--------|
| `subscribe` | `handleSubscribe()` | Create terminal bridge, track subscription, send buffer |
| `unsubscribe` | `handleUnsubscribe()` | Close terminal bridge, remove subscription |
| `input` | `handleInput()` | Send user input to terminal |
| `resize` | `handleResize()` | Update terminal dimensions |
| `list-sessions` | `handleListSessions()` | Send current session list |
| *(unknown)* | (error) | Reply with error message |

#### Handler Details

**handleSubscribe(ws, clientId, sessionId)**
1. Look up session from discovery service
2. Return error if not found
3. Create terminal bridge via `terminalBridgeManager.subscribe()`
4. Track subscription in `clientSubscriptions`
5. Send buffered terminal output if available

**handleUnsubscribe(ws, clientId, sessionId)**
1. Call `terminalBridgeManager.unsubscribe()`
2. Remove from subscription tracking

**handleInput(sessionId, data)**
1. Call `terminalBridgeManager.sendInput(sessionId, data)`

**handleResize(sessionId, cols, rows)**
1. Call `terminalBridgeManager.resize(sessionId, cols, rows)`

**handleListSessions(ws)**
1. Get managed sessions from discovery service
2. Send to client

#### Broadcast Methods

**broadcastToSubscribers(sessionId, message)**
- Iterates all clients
- Only sends to clients subscribed to `sessionId`
- Checks WebSocket is `OPEN` before sending

**broadcastToAll(message)**
- Sends to all connected clients
- Used for session list updates

#### Singleton Export

```typescript
export const messageHandler = new MessageHandler();
```

Used by `WebSocketServer` for event routing and by `TerminalBridgeManager`/`SessionDiscoveryService` for output/change notification.

## Message Protocol

Defined in `../types/Protocol.ts`

### Client → Server

| Type | Fields | Purpose |
|------|--------|---------|
| `subscribe` | `sessionId: string` | Connect to terminal stream |
| `unsubscribe` | `sessionId: string` | Disconnect from terminal |
| `input` | `sessionId: string, data: string` | Send user input to terminal |
| `resize` | `sessionId: string, cols: number, rows: number` | Resize terminal |
| `list-sessions` | *(none)* | Request current session list |
| `auth-refresh` | `token: string` | Refresh auth token |

### Server → Client

| Type | Fields | Purpose |
|------|--------|---------|
| `sessions` | `sessions: Session[]` | Current session list (pushed on connect and on changes) |
| `output` | `sessionId: string, data: string` | Terminal output data (streamed in real-time) |
| `buffer` | `sessionId: string, data: string[]` | Buffered output from terminal (sent on subscribe) |
| `session-added` | `session: Session` | New session appeared |
| `session-removed` | `sessionId: string` | Session was deleted |
| `session-updated` | `session: Session` | Session metadata changed |
| `error` | `message: string, code?: string` | Operation failed |
| `auth-expired` | *(none)* | Auth token expired, require re-login |

## Data Flow Examples

### Example 1: Client Subscribes to Terminal

```
1. Client: { type: 'subscribe', sessionId: 'local:$0:0' }
     ↓
2. WebSocketServer.on:message()
     ↓
3. MessageHandler.handleMessage() → MessageHandler.handleSubscribe()
     ↓
4. sessionDiscoveryService.getSession('local:$0:0')
     ↓
5. TerminalBridgeManager.subscribe({
      sessionId, tmuxTarget, cols, rows
     }, clientId)
     ↓
6. MessageHandler.clientSubscriptions.get(ws).add('local:$0:0')
     ↓
7. Client: { type: 'buffer', sessionId: '...', data: ['...', '...'] }
     ↓
8. [Terminal output arrives]
     ↓
9. TerminalBridgeManager.outputHandler called
     ↓
10. MessageHandler.broadcastToSubscribers('local:$0:0', {
      type: 'output',
      sessionId: 'local:$0:0',
      data: '...'
    })
```

### Example 2: Session List Updates

```
1. User attaches new session via API endpoint
     ↓
2. SessionDiscoveryService.refresh()
     ↓
3. SessionDiscoveryService.onSessionsChange() triggered
     ↓
4. MessageHandler callback fires with updated sessions
     ↓
5. MessageHandler.broadcastToAll({
      type: 'sessions',
      sessions: [...]
    })
     ↓
6. All connected clients receive updated list
```

### Example 3: User Types in Terminal

```
1. Client: { type: 'input', sessionId: 'local:$0:0', data: 'ls\n' }
     ↓
2. WebSocketServer.on:message()
     ↓
3. MessageHandler.handleMessage() → MessageHandler.handleInput()
     ↓
4. TerminalBridgeManager.sendInput('local:$0:0', 'ls\n')
     ↓
5. [Input reaches tmux pane]
     ↓
6. [Output generated]
     ↓
7. TerminalBridgeManager.outputHandler called
     ↓
8. MessageHandler.broadcastToSubscribers('local:$0:0', {
      type: 'output',
      sessionId: 'local:$0:0',
      data: '...'
    })
```

## Integration Points

### Upstream Dependencies

| Service | Used By | For |
|---------|---------|-----|
| `SessionDiscoveryService` | `MessageHandler` | Session lookup, session list broadcasts |
| `TerminalBridgeManager` | `MessageHandler` | Terminal I/O routing, subscription management |
| `AuthMiddleware` | `app.ts` | Protecting API routes (WebSocket at `/ws` path is accessible) |

### Downstream Consumers

| Consumer | Uses | For |
|----------|------|-----|
| Frontend (browser) | `app.ts` routes | REST API calls for metadata |
| Frontend (browser) | WebSocket `/ws` | Real-time terminal and session updates |

## Common Tasks

### Add a new WebSocket message type

1. **Define protocol** in `../types/Protocol.ts`
   ```typescript
   export interface MyMessage {
     type: 'my-type';
     field1: string;
   }
   export type ClientMessage = ... | MyMessage;
   ```

2. **Add handler** in `MessageHandler.ts`
   ```typescript
   case 'my-type':
     await this.handleMyType(ws, clientId, message.field1);
     break;
   ```

3. **Implement handler**
   ```typescript
   private handleMyType(ws: WebSocket, clientId: string, field: string): void {
     // Do work
     this.send(ws, { type: 'result', ... });
   }
   ```

### Broadcast to all clients

```typescript
messageHandler.broadcastToAll({
  type: 'event-type',
  data: '...'
});
```

### Broadcast to subscribed clients only

```typescript
messageHandler.broadcastToSubscribers('sessionId', {
  type: 'event-type',
  data: '...'
});
```

### Test WebSocket connection

```bash
# From client:
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'list-sessions' }));
```

## Testing Checklist

- [ ] HTTP server starts on configured port
- [ ] CORS allows frontend origins
- [ ] WebSocket `/ws` endpoint accepts connections
- [ ] Client receives session list on connection
- [ ] Subscribe message creates terminal bridge
- [ ] Terminal output appears in real-time
- [ ] Input message sends data to terminal
- [ ] Resize message updates dimensions
- [ ] Heartbeat detects and removes dead connections
- [ ] Unsubscribe stops receiving output
- [ ] Broadcast messages reach all clients
- [ ] Error messages are properly formatted

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| WebSocket connection refused | Server not started or wrong port | Verify `startServer()` called, check port in browser console |
| Messages not received | Client not subscribed to session | Send `subscribe` message first |
| Terminal output stops | Bridge disconnected or graceful timeout | Re-subscribe before 30-second window |
| CORS error on frontend | Origin not in allowlist | Add frontend URL to `CORS.origin` array in `app.ts` |
| Dead connections accumulate | Heartbeat not running | Check `pingInterval` starts in `initialize()` |

