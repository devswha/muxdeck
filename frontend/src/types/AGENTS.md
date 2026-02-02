<!-- Parent: ../AGENTS.md -->

# frontend/src/types

## Purpose

TypeScript type definitions for the frontend React application. Mirrors backend API types while adding UI-specific fields. These types define the core domain models for sessions, workspaces, hosts, todos, backlog items, and project grouping.

**Key Principle:** Frontend types explicitly mirror backend types rather than sharing a package. This allows independent evolution of frontend and backend while maintaining type safety. Each type documents its correspondence to the backend equivalent.

## Files

### Session.ts

Core session representation with complete lifecycle and runtime state.

**Types:**
- `SessionStatus`: Union type `'active' | 'idle' | 'disconnected' | 'terminated'`
  - `active` - Session has user input/activity
  - `idle` - Session exists but no recent activity
  - `disconnected` - Lost connection to host
  - `terminated` - Session ended or killed

- `HostType`: Union type `'local' | 'remote'` (for SSH vs local machine)

**Interfaces:**

`SessionHost` - Host reference within a session
```typescript
interface SessionHost {
  id: string;              // Host ID (for SSH hosts, references hosts.json)
  type: HostType;          // 'local' or 'remote' (SSH)
  displayName: string;     // "Local Machine" or hostname
}
```

`TmuxInfo` - tmux session metadata
```typescript
interface TmuxInfo {
  sessionId: string;       // Internal tmux session ID
  sessionName: string;     // User-visible session name
  paneId: string;          // Current pane ID
  windowIndex: number;     // Current window number
}
```

`ProcessInfo` - Current running process in session
```typescript
interface ProcessInfo {
  pid: number;             // Process ID
  currentCommand: string;  // Command line of running process
}
```

`Dimensions` - Terminal size
```typescript
interface Dimensions {
  cols: number;            // Terminal width in columns
  rows: number;            // Terminal height in rows
}
```

`Session` - Complete session definition (mirrors backend, adds UI fields)
```typescript
interface Session {
  // Identity
  id: string;
  name: string;

  // Location
  host: SessionHost;
  workspaceId: string | null;      // Optional workspace assignment
  workingDirectory: string | null;  // Current working directory on host

  // tmux info
  tmux: TmuxInfo;

  // Runtime state
  status: SessionStatus;
  isClaudeSession: boolean;
  process: ProcessInfo;
  dimensions: Dimensions;

  // Timing
  createdAt: string;       // ISO 8601 timestamp
  lastActivityAt: string;  // ISO 8601 timestamp

  // UI-specific fields (optional, populated from service)
  lastOutput?: string;           // Last line of terminal output for preview
  statusBar?: string;            // tmux status bar right side content
  conversationSummary?: string;  // Claude conversation summary (if Claude session)
  userLastInput?: string;        // User's last input from terminal
}
```

**Protocol Types:**

Message types for WebSocket communication:
- `SessionsMessage` - List of all sessions from server
- `OutputMessage` - Terminal output from a session
- `BufferMessage` - Buffered output lines (for catchup)
- `ErrorMessage` - Server error with optional error code
- `ServerMessage` - Union of all message types (catch-all for unknown types)

**Usage:** Session is the primary domain model throughout the frontend. It's populated by the backend via WebSocket and used in session tiles, terminal renderer, and workspace grouping logic.

---

### Workspace.ts

Workspace grouping for organizing sessions. A workspace is a named container that groups related sessions.

**Interfaces:**

`Workspace` - Core workspace definition
```typescript
interface Workspace {
  id: string;
  name: string;
  description?: string;
  hidden?: boolean;          // UI state: workspace hidden from main view
  createdAt: string;
  updatedAt: string;
}
```

`WorkspaceWithSessions` - Extended type for UI with sessions included (mirrors backend's "read" response)
```typescript
interface WorkspaceWithSessions extends Workspace {
  sessions: Session[];       // Sessions in this workspace
  isCollapsed: boolean;      // UI state: workspace group collapsed in grid
}
```

**Request/Response Types:**

`CreateWorkspaceRequest` - Payload to create a new workspace
```typescript
interface CreateWorkspaceRequest {
  name: string;
  description?: string;
}
```

`UpdateWorkspaceRequest` - Payload to update a workspace
```typescript
interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  hidden?: boolean;
}
```

**Key Behaviors:**
- Empty workspaces appear in grouped view (zero sessions)
- Sessions with `workspaceId: null` are excluded from grouped view
- `isCollapsed` is UI state, not persisted (reset on reload)
- `hidden` is persisted; hidden workspaces don't appear in main view

**Usage:** Used by workspace management dialogs, workspace grouping logic, and the grid display component. Services fetch both `Workspace[]` and `WorkspaceWithSessions[]` depending on context.

---

### Host.ts

SSH host configuration for remote session access.

**Interfaces:**

`Host` - Backend host definition
```typescript
interface Host {
  id: string;
  name: string;
  type: 'local' | 'ssh';
  hostname?: string;    // IP address or hostname (SSH hosts only)
  connected?: boolean;  // Test result (transient)
}
```

`HostInfo` - Display-friendly version for UI panels
```typescript
interface HostInfo {
  id: string;
  displayName: string;  // User-friendly name
  address: string;      // "Local Machine" or hostname/IP
  type: 'local' | 'ssh';
}
```

**Helper Function:**

`toHostInfo(host: Host): HostInfo` - Converts Host to display format
- Local host: address becomes "Local Machine"
- SSH host: address becomes hostname or "Unknown"

**Usage:** Host data comes from `config/hosts.json` on the backend. Displayed in workspace info panels and session creation dialogs. Frontend receives Host array from `/api/hosts` endpoint.

---

### Backlog.ts

Backlog feature for tracking ideas, bugs, and improvements.

**Types:**

- `BacklogItemType`: `'bug' | 'feature' | 'improvement'`
- `BacklogPriority`: `'low' | 'medium' | 'high'`
- `BacklogStatus`: `'pending' | 'in_progress' | 'done'`

**Interfaces:**

`BacklogItem` - Complete backlog item
```typescript
interface BacklogItem {
  id: string;
  type: BacklogItemType;
  title: string;
  description?: string;
  priority: BacklogPriority;
  status: BacklogStatus;
  createdAt: string;
  updatedAt: string;
}
```

`CreateBacklogItemRequest` - Payload for new backlog item
```typescript
interface CreateBacklogItemRequest {
  type: BacklogItemType;
  title: string;
  description?: string;
  priority?: BacklogPriority;  // Defaults to 'medium'
}
```

`UpdateBacklogItemRequest` - Payload for updating backlog item
```typescript
interface UpdateBacklogItemRequest {
  type?: BacklogItemType;
  title?: string;
  description?: string;
  priority?: BacklogPriority;
  status?: BacklogStatus;
}
```

`BacklogStats` - Aggregate statistics
```typescript
interface BacklogStats {
  total: number;      // Total items
  pending: number;    // Items not started
  bugs: number;       // Bug count
  features: number;   // Feature count
}
```

**Usage:** Displayed in BacklogPanel component. Backend endpoint: `/api/backlog` with GET, POST, PATCH, DELETE methods. Statistics shown in backlog header.

---

### Todo.ts

Simple todo items scoped to a workspace for task tracking.

**Interfaces:**

`Todo` - Complete todo item
```typescript
interface Todo {
  id: string;
  workspaceId: string;    // Todos belong to a specific workspace
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}
```

`CreateTodoRequest` - Payload for new todo
```typescript
interface CreateTodoRequest {
  text: string;
}
```

`UpdateTodoRequest` - Payload for updating todo
```typescript
interface UpdateTodoRequest {
  text?: string;
  completed?: boolean;
}
```

**Usage:** Todos are workspace-scoped (no workspace ID means no todos exist). Used by WorkspaceInfoButton component to display workspace-specific todo lists. Backend endpoint: `/api/todos/{workspaceId}`.

---

### Project.ts

Project grouping by working directory. Organizes sessions by where they're running.

**Interface:**

`Project` - Session group by working directory
```typescript
interface Project {
  id: string;                    // ${hostId}:${workingDirectory} or ${hostId}:ungrouped
  name: string;                  // Basename of directory or "Other"
  workingDirectory: string | null;
  hostId: string;                // Scoped to specific host
  sessions: Session[];           // Sessions in this project
  isCollapsed: boolean;          // UI state: project group collapsed
}
```

**Utility Functions:**

`groupSessionsByProject(sessions: Session[]): Project[]`

Groups sessions by working directory within each host. Sessions with `null` working directory go into an "Other" project (always last).

**Sorting:** Alphabetical by project name, "Other" always at end
**Collapse State:** UI-only, not persisted across reload

Example:
```typescript
// Input: Sessions from /root/.config/project-a and /root/.config/project-b
const projects = groupSessionsByProject(sessions);
// Output: [
//   { id: 'host1:/root/.config/project-a', name: 'project-a', ... },
//   { id: 'host1:/root/.config/project-b', name: 'project-b', ... },
//   { id: 'host1:ungrouped', name: 'Other', ... }  // Sessions with null workingDirectory
// ]
```

`groupSessionsByWorkspace(sessions: Session[], workspaces: Workspace[], collapsedWorkspaceIds?: Set<string>): WorkspaceWithSessions[]`

Groups sessions by workspace assignment. Respects workspace ordering and handles missing workspaces.

**Behavior:**
- All workspaces appear in result (even empty ones)
- Sessions without `workspaceId` are excluded
- Sessions referencing non-existent workspaces are silently excluded
- Collapse state passed as Set of workspace IDs
- Result sorted alphabetically by workspace name

Example:
```typescript
const groupedWorkspaces = groupSessionsByWorkspace(
  sessions,
  workspaces,
  new Set(['workspace-2'])  // workspace-2 starts collapsed
);
// Returns WorkspaceWithSessions[] with all workspaces, sessions grouped by assignment
```

**Usage:** Project view in WorkspaceGrid. Workspace grouping in main application view. Collapse states are UI-only and reset on reload.

---

## Design Patterns

### Type Mirroring

Frontend types are **not shared** with the backend. Instead, they're explicitly redefined with the same structure. This allows:
- Independent type evolution (UI-specific fields like `isCollapsed` only exist in frontend)
- Type safety without cross-package dependencies
- Clear documentation of which fields are backend vs UI-specific

### Null/Optional Handling

- `workspaceId: string | null` - Sessions may not belong to a workspace
- `workingDirectory: string | null` - Sessions may not have a meaningful working directory
- Optional fields like `description?` indicate truly optional data

### UI State vs Persistent State

**Persistent (via backend):**
- `hidden` on Workspace - workspace visibility
- `status` on Session - connection state
- `completed` on Todo - task completion

**UI-Only (reset on reload):**
- `isCollapsed` on WorkspaceWithSessions, Project - group collapse state
- `connected?` on Host - test result freshness

### Request/Response Patterns

- **Create requests** omit `id`, `createdAt`, `updatedAt`
- **Update requests** make all fields optional
- **Responses** include full model with timestamps

---

## For AI Agents

### Quick Reference

| Type | Source | Persistence |
|------|--------|-------------|
| Session | Backend WebSocket | Live (server-side) |
| Workspace | Backend REST API | Persistent (JSON) |
| Host | Backend (hosts.json) | Persistent (config file) |
| Todo | Backend REST API | Persistent (JSON) |
| Backlog | Backend REST API | Persistent (JSON) |
| Project | Computed from Session.workingDirectory | Computed at runtime |

### Common Tasks

**Adding a UI field to Session:**
1. Add optional field to `Session` interface with `?`
2. Document whether it comes from backend or is UI-computed
3. Update service that populates it (likely TerminalBridge or SessionDiscoveryService)

**Adding a new type:**
1. Create new file in this directory following existing patterns
2. Use Union types for enums (not `enum` keyword for better JSON compatibility)
3. Separate create/update request types from response types
4. Add to parent AGENTS.md with examples

**Debugging type mismatches:**
- Check backend types at `src/types/` in root
- Verify field names match exactly (case-sensitive)
- Ensure optional fields use `?` correctly
- Search for usage in services/ and components/

### Files That Import From Here

Key consumers of these types:
- `frontend/src/services/WorkspaceService.ts` - Fetches Workspace, BacklogItem
- `frontend/src/services/SessionService.ts` - Fetches Session
- `frontend/src/hooks/useSessions.ts` - Uses Session type
- `frontend/src/components/WorkspaceGrid.tsx` - Uses groupSessionsByWorkspace
- `frontend/src/components/Terminal.tsx` - Uses Session, Dimensions
- `frontend/src/components/BacklogPanel.tsx` - Uses BacklogItem, BacklogStats
- `frontend/src/components/WorkspaceInfoButton.tsx` - Uses Workspace, Todo

---

## Protocol Reference

WebSocket messages are typed in `Session.ts` for cross-cutting protocol concerns:

```typescript
type ServerMessage = SessionsMessage | OutputMessage | BufferMessage | ErrorMessage | { type: string };
```

The catch-all `{ type: string }` allows forward compatibility with new message types from the backend without breaking the frontend.
