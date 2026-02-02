<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# types

TypeScript type definitions and interfaces shared between API routes, services, and frontend clients. Provides the foundational type contract for the entire session-manager system.

## Purpose

Centralizes all TypeScript type definitions to ensure type safety across:
- **REST API** - Request/response types for all endpoints
- **WebSocket Protocol** - Client-server message types
- **Domain Models** - Session, Workspace, Terminal, Backlog, Todo entities
- **Service Interfaces** - Contracts between business logic layers
- **Frontend Integration** - Type-safe communication with React client

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│             TypeScript Type Definitions                 │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌────────┐          ┌──────────┐        ┌──────────┐
    │ Domain │          │ Protocol │        │ Requests │
    │ Models │          │  Types   │        │ & Response
    └────────┘          └──────────┘        └──────────┘
         │                    │                    │
    ┌────┴────┬────────┬──────┴──────┐       ┌────┴─────┐
    │          │        │             │       │          │
    ▼          ▼        ▼             ▼       ▼          ▼
 Session  Workspace Terminal     Protocol Backlog     Todo
 (Domain) (Domain)   (Domain)   (WebSocket) (Domain) (Domain)
    │          │        │             │       │          │
    └──────────┴────────┴─────────────┴───────┴──────────┘
                        │
           ┌────────────┼────────────┐
           │            │            │
           ▼            ▼            ▼
      Services        API Routes  Frontend Client
    (Business Logic) (Handlers)   (React/UI)
```

## Key Files

| File | Description | Key Types |
|------|-------------|-----------|
| **Session.ts** | Session domain model and lifecycle types | `Session`, `SessionStatus`, `SessionHost`, `TmuxInfo`, `ProcessInfo`, `Dimensions`, `CreateSessionRequest`, `AttachSessionRequest`, `CreateSessionResponse` |
| **Workspace.ts** | Workspace grouping and organization types | `Workspace`, `CreateWorkspaceRequest`, `UpdateWorkspaceRequest` |
| **Terminal.ts** | Terminal bridge state and configuration | `BridgeState`, `TerminalBridgeInfo`, `BridgeConfig` |
| **Protocol.ts** | WebSocket message protocol types | `ClientMessage`, `ServerMessage`, `SubscribeMessage`, `InputMessage`, `OutputMessage`, `ResizeMessage`, `SessionsMessage`, etc. |
| **Backlog.ts** | Feature backlog and issue tracking types | `BacklogItem`, `BacklogItemType`, `BacklogPriority`, `BacklogStatus`, `CreateBacklogItemRequest`, `UpdateBacklogItemRequest` |
| **Todo.ts** | Todo item tracking types | `Todo`, `CreateTodoRequest`, `UpdateTodoRequest` |

## Type Definitions

### Session.ts

**Domain Model:**
```typescript
interface Session {
  id: string;                      // Composite: {hostId}:{tmuxSessionId}:{paneId}
  name: string;                    // User-friendly session name
  host: SessionHost;               // Host info (id, type, displayName)
  tmux: TmuxInfo;                  // tmux identifiers (sessionId, sessionName, paneId, windowIndex)
  status: SessionStatus;           // 'active' | 'idle' | 'disconnected' | 'terminated'
  isClaudeSession: boolean;        // True if created via claude CLI
  process: ProcessInfo;            // Running process (pid, currentCommand)
  createdAt: string;               // ISO timestamp
  lastActivityAt: string;          // ISO timestamp of last user activity
  dimensions: Dimensions;          // Terminal size (cols, rows)
  workingDirectory: string | null; // Current working directory
  workspaceId: string | null;      // Associated workspace UUID
  lastOutput?: string;             // Single-line preview of terminal output (100 char max, ANSI stripped)
  statusBar?: string;              // tmux status-right content (150 char max)
  conversationSummary?: string;    // Claude conversation summary from project files
  userLastInput?: string;          // User's last command input (for Claude sessions)
}
```

**Status Enum:**
```typescript
type SessionStatus = 'active' | 'idle' | 'disconnected' | 'terminated';
```

**Host Types:**
```typescript
type HostType = 'local' | 'remote';

interface SessionHost {
  id: string;           // Unique host identifier (e.g., 'local', 'prod-server')
  type: HostType;       // Local or remote SSH host
  displayName: string;  // User-friendly name
}
```

**tmux Integration:**
```typescript
interface TmuxInfo {
  sessionId: string;    // Internal tmux session ID (e.g., '$0')
  sessionName: string;  // User-assigned session name
  paneId: string;       // Pane identifier
  windowIndex: number;  // Window index in session
}
```

**Process Information:**
```typescript
interface ProcessInfo {
  pid: number;          // Process ID
  currentCommand: string; // Running command name
}
```

**Terminal Dimensions:**
```typescript
interface Dimensions {
  cols: number;         // Terminal width in columns
  rows: number;         // Terminal height in rows
}
```

**Request/Response Types:**
```typescript
interface CreateSessionRequest {
  workingDirectory: string;  // Working dir for new session
  hostId: string;           // Target host
  sessionName?: string;     // Optional session name
  claudeArgs?: string[];    // Arguments for claude CLI
  workspaceId?: string;     // Optional workspace association
}

interface AttachSessionRequest {
  sessionName: string;      // Existing tmux session to attach
  hostId: string;          // Host where session exists
  workspaceId?: string;    // Optional workspace association
}

interface CreateSessionResponse {
  session: Session;        // Created session with all details
}
```

### Workspace.ts

**Domain Model:**
```typescript
interface Workspace {
  id: string;              // UUID
  name: string;            // User-defined workspace name
  description?: string;    // Optional description
  hidden?: boolean;        // Whether workspace is hidden from list
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
}
```

**Request Types:**
```typescript
interface CreateWorkspaceRequest {
  name: string;            // Required workspace name
  description?: string;    // Optional description
}

interface UpdateWorkspaceRequest {
  name?: string;           // Update name
  description?: string;    // Update description
  hidden?: boolean;        // Toggle visibility
}
```

### Terminal.ts

**Bridge State Machine:**
```typescript
type BridgeState = 'initializing' | 'connected' | 'paused' | 'error' | 'closed';
```

**Bridge Information:**
```typescript
interface TerminalBridgeInfo {
  id: string;                          // Bridge instance ID
  sessionId: string;                   // Associated session ID
  state: BridgeState;                  // Current connection state
  dimensions: {
    cols: number;                      // Terminal width
    rows: number;                      // Terminal height
  };
  subscriberCount: number;             // Active WebSocket subscribers
  lastError?: string;                  // Last error message (if state='error')
  lastActivityAt: Date;                // Last activity timestamp
}
```

**Bridge Configuration:**
```typescript
interface BridgeConfig {
  sessionId: string;                   // Session to bridge
  tmuxTarget: string;                  // tmux target: "session:pane"
  cols: number;                        // Terminal width
  rows: number;                        // Terminal height
  readOnly?: boolean;                  // If true, input messages rejected
}
```

### Protocol.ts

**Client → Server Messages:**

```typescript
interface SubscribeMessage {
  type: 'subscribe';
  sessionId: string;                   // Session to subscribe to
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  sessionId: string;                   // Session to unsubscribe from
}

interface InputMessage {
  type: 'input';
  sessionId: string;                   // Target session
  data: string;                        // User input (commands, characters)
}

interface ResizeMessage {
  type: 'resize';
  sessionId: string;                   // Target session
  cols: number;                        // New column count
  rows: number;                        // New row count
}

interface ListSessionsMessage {
  type: 'list-sessions';               // Request all sessions from server
}

interface AuthRefreshMessage {
  type: 'auth-refresh';
  token: string;                       // New JWT token
}
```

**Server → Client Messages:**

```typescript
interface SessionsMessage {
  type: 'sessions';
  sessions: Session[];                 // Full session list
}

interface OutputMessage {
  type: 'output';
  sessionId: string;                   // Source session
  data: string;                        // Terminal output data
}

interface SessionAddedMessage {
  type: 'session-added';
  session: Session;                    // New session details
}

interface SessionRemovedMessage {
  type: 'session-removed';
  sessionId: string;                   // Removed session ID
}

interface SessionUpdatedMessage {
  type: 'session-updated';
  session: Session;                    // Updated session details
}

interface ErrorMessage {
  type: 'error';
  message: string;                     // Error description
  code?: string;                       // Optional error code
}

interface AuthExpiredMessage {
  type: 'auth-expired';                // JWT token expired
}

interface BufferMessage {
  type: 'buffer';
  sessionId: string;                   // Source session
  data: string[];                      // Terminal output buffer (multiple lines)
}
```

### Backlog.ts

**Type Enums:**
```typescript
type BacklogItemType = 'bug' | 'feature' | 'improvement';
type BacklogPriority = 'low' | 'medium' | 'high';
type BacklogStatus = 'pending' | 'in_progress' | 'done';
```

**Domain Model:**
```typescript
interface BacklogItem {
  id: string;                          // Unique ID
  type: BacklogItemType;               // Classification
  title: string;                       // Item title
  description?: string;                // Optional description
  priority: BacklogPriority;           // Priority level
  status: BacklogStatus;               // Current status
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
}
```

**Request Types:**
```typescript
interface CreateBacklogItemRequest {
  type: BacklogItemType;               // Required type
  title: string;                       // Required title
  description?: string;                // Optional description
  priority?: BacklogPriority;          // Default: 'medium'
}

interface UpdateBacklogItemRequest {
  type?: BacklogItemType;              // Update type
  title?: string;                      // Update title
  description?: string;                // Update description
  priority?: BacklogPriority;          // Update priority
  status?: BacklogStatus;              // Update status
}
```

### Todo.ts

**Domain Model:**
```typescript
interface Todo {
  id: string;                          // Unique ID
  workspaceId: string;                 // Associated workspace
  text: string;                        // Todo item text
  completed: boolean;                  // Completion status
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
}
```

**Request Types:**
```typescript
interface CreateTodoRequest {
  text: string;                        // Required todo text
}

interface UpdateTodoRequest {
  text?: string;                       // Update text
  completed?: boolean;                 // Update completion status
}
```

## Key Patterns

### Composite Session IDs

Sessions use composite IDs: `{hostId}:{tmuxSessionId}:{paneId}`

Examples:
- `local:$0:0` - Local host, tmux session $0, pane 0
- `prod-server:$5:1` - Remote host "prod-server", tmux session $5, pane 1

**Parsing:**
```typescript
const [hostId, tmuxSessionId, paneId] = sessionId.split(':');
```

### ISO Timestamp Convention

All timestamp fields use ISO 8601 format:
```typescript
createdAt: string;     // "2026-02-01T12:34:56.789Z"
lastActivityAt: string; // "2026-02-01T12:35:42.123Z"
```

### Optional vs Required Fields

- **Create requests**: Minimize required fields (name, type)
- **Update requests**: All fields optional (client specifies what to update)
- **Response models**: Include full state for caching

### Type Safety Across Layers

**Frontend → API:**
```typescript
// Frontend uses CreateSessionRequest to send data
const response = await api.post('/sessions', {
  workingDirectory: '/home/user/project',
  hostId: 'local'
} as CreateSessionRequest);
```

**API → Service:**
```typescript
// API routes pass typed objects to services
const session = await sessionManager.createSession(request);
```

**Service → Client:**
```typescript
// Services return domain models
const sessions: Session[] = await sessionDiscoveryService.getSessions();
```

## For AI Agents

### Adding a New Type

1. **Create file** in `src/types/{Resource}.ts`
2. **Define domain model** (core entity)
3. **Define request types** (Create/Update operations)
4. **Update exports** in this directory
5. **Import in services** that use the type
6. **Update Protocol.ts** if WebSocket messages needed

### Extending Session Type

Current fields cover:
- Basic identity (id, name)
- Host & tmux info (where it runs)
- Process state (what's running)
- Terminal state (dimensions, output)
- Workspace association (organization)
- Claude-specific metadata (isClaudeSession, conversationSummary)

To add new fields:
1. Add property to `Session` interface
2. Update `SessionDiscoveryService` to populate the field
3. Ensure API endpoints serialize the field
4. Test with both local and remote sessions

### Type Versioning

No explicit versioning in types currently. For breaking changes:
1. Add new field as optional
2. Deprecate old field in comments
3. Update all consumers gradually
4. Remove old field in next major release

## Common Tasks

### Type a New API Endpoint

Create request/response types and register in service:

```typescript
// In types/Resource.ts
export interface MyRequest {
  id: string;
  value: string;
}

export interface MyResponse {
  id: string;
  value: string;
  createdAt: string;
}

// In services/MyService.ts
async function myOperation(req: MyRequest): Promise<MyResponse> {
  // Implementation
}

// In api/resource.ts
app.post<{ Body: MyRequest }>('/resource', async (request, reply) => {
  const response = await myService.myOperation(request.body);
  reply.send(response);
});
```

### Add WebSocket Message Type

1. Define message interface in `Protocol.ts`
2. Add to `ClientMessage` or `ServerMessage` union
3. Handle in `MessageHandler.ts`

```typescript
// In Protocol.ts
export interface MyCustomMessage {
  type: 'my-custom';
  sessionId: string;
  payload: any;
}

export type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | ... other messages ...
  | MyCustomMessage;  // Add here
```

### Share Types with Frontend

Frontend imports directly from `src/types`:

```typescript
// Frontend: src/types/Session.ts (symlink or copy)
import { Session, SessionStatus } from '@/types/Session';
```

Ensure types are JSON-serializable (no methods, only data).

## Type Safety Validation

**Rules:**
- [ ] All domain models have required `id` and timestamp fields
- [ ] All request types are strict subsets of domain models
- [ ] All response types match domain models exactly
- [ ] WebSocket message types have `type` discriminant field
- [ ] No circular type dependencies
- [ ] Optional fields marked with `?`
- [ ] Use enums for fixed sets of values
- [ ] Timestamps are `string` (ISO 8601), not `Date`

## Integration Points

| Component | Consumes | Produces |
|-----------|----------|----------|
| **Frontend** | All types | CreateRequest types |
| **API Routes** | Request types | Response types (domain models) |
| **Services** | Domain models | Domain models |
| **Database** | Domain models | Domain models (with serialization) |
| **WebSocket** | ClientMessage | ServerMessage |

## Dependencies

- **TypeScript** - Type definitions
- **No runtime dependencies** - Pure type definitions

## Testing Checklist

- [ ] Session interface covers all fields returned by SessionDiscoveryService
- [ ] WebSocket message types match actual protocol implementation
- [ ] Request types validate in API route handlers
- [ ] Response types serialize to JSON without errors
- [ ] Frontend can import types without circular dependencies
- [ ] No `any` types (unless explicitly needed)
- [ ] All enums have corresponding string literals

## Related Documentation

- **Session Management**: See `../services/SessionDiscoveryService.ts`
- **WebSocket Protocol**: See `../server/MessageHandler.ts`
- **API Endpoints**: See `../api/*.ts` files
- **Frontend Integration**: See `../../frontend/src/types/`

## MANUAL:

This documentation describes the type definitions that provide the type contract for the entire session-manager system. When adding new features:

1. **Update types first** - Define request/response types before implementing
2. **Keep types in sync** - When changing a service, update corresponding type
3. **Validate serialization** - Ensure types can be JSON-stringified and parsed
4. **Document breaking changes** - Note when existing types change
5. **Test type compatibility** - Verify frontend and backend types match
