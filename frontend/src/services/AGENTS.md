<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# frontend/src/services

Frontend API client services providing typed async functions that communicate with the backend REST and WebSocket APIs.

## Purpose

Encapsulates all HTTP API interactions and client-side persistence logic. Each service exports async functions that handle authentication, error handling, and response parsing. Services use localStorage for token management and access environment configuration for API endpoints.

## Architecture

**Pattern**: Services export async functions that:
1. Build request with authentication headers via `getToken()` or `getAuthHeaders()`
2. Fetch from backend API (base URL from environment or hardcoded)
3. Handle response errors with descriptive messages
4. Return typed response data or throw on error

**Authentication**: Uses JWT tokens stored in localStorage with key `'session-manager-token'` (or `'token'` in BacklogService). Services read token via `getToken()` helper or direct localStorage access.

**Error Handling**: HTTP errors caught and re-thrown with user-friendly messages; JSON parsing errors handled gracefully (e.g., empty DELETE responses).

## Services

### AuthService.ts

**Purpose**: JWT token management and authentication state tracking.

**Key Functions**:
- `getToken(): string | null` - Retrieves stored JWT token from localStorage
- `setToken(token: string): void` - Stores JWT token in localStorage
- `clearToken(): void` - Removes token from localStorage
- `isAuthenticated(): boolean` - Checks if token exists and is not expired (decodes JWT payload client-side)
- `checkAuthEnabled(): Promise<boolean>` - Queries `/api/auth/status` endpoint to check if auth is enabled server-side
- `logout(): void` - Clears token, clears all persisted state via `clearPersistence()`, reloads page

**Storage Key**: `'session-manager-token'`

**Implementation Details**:
- JWT expiry validation: decodes middle segment of token, parses as JSON, compares `exp * 1000 > Date.now()`
- No server verification; client-side check only
- Logout triggers full page reload to reset UI state

**Error Handling**: Gracefully returns `false` if token parsing fails or auth check fails

---

### WorkspaceService.ts

**Purpose**: CRUD operations for workspaces and session-to-workspace assignment.

**Key Functions**:
- `fetchWorkspaces(): Promise<Workspace[]>` - GET `/api/workspaces` - Retrieves all workspaces
- `createWorkspace(request: CreateWorkspaceRequest): Promise<Workspace>` - POST `/api/workspaces` - Creates new workspace
- `updateWorkspace(id: string, request: UpdateWorkspaceRequest): Promise<Workspace>` - PUT `/api/workspaces/{id}` - Updates workspace fields
- `deleteWorkspace(id: string): Promise<void>` - DELETE `/api/workspaces/{id}` - Deletes workspace
- `renameWorkspace(id: string, name: string): Promise<Workspace>` - PUT `/api/workspaces/{id}` with `{ name }` - Renames workspace
- `assignSessionToWorkspace(sessionId: string, workspaceId: string | null): Promise<Session>` - PUT `/api/sessions/{sessionId}/workspace` - Assigns session to workspace (or unassigns if `null`)
- `hideWorkspace(id: string): Promise<Workspace>` - PUT `/api/workspaces/{id}` with `{ hidden: true }` - Hides workspace from UI
- `showWorkspace(id: string): Promise<Workspace>` - PUT `/api/workspaces/{id}` with `{ hidden: false }` - Unhides workspace

**API Base**: `/api`

**Auth Headers**: Uses `getAuthHeaders()` helper which includes Bearer token if available

**Response Parsing**:
- Create/update/rename return workspace object directly
- Hide/show return `{ workspace: Workspace }` wrapper; service extracts `.workspace` field

**Error Handling**: Catches HTTP errors, attempts JSON parse of error response for `error.error` message, falls back to generic message

---

### HostService.ts

**Purpose**: SSH host discovery and management.

**Key Functions**:
- `fetchHosts(): Promise<Host[]>` - GET `/api/hosts` - Retrieves all configured SSH hosts

**Types**:
```typescript
interface Host {
  id: string;
  name: string;
  type: 'local' | 'ssh';
  hostname?: string;
  connected?: boolean;
}
```

**API Base**: `/api`

**Auth Headers**: Uses `getToken()` to build headers with Bearer token if available

**Implementation**: Minimal service; returns `data.hosts` from response

**Usage**: Typically called at app startup to populate host list in UI dropdown

---

### SessionService.ts

**Purpose**: Session visibility control (hide/show operations).

**Key Functions**:
- `hideSession(sessionId: string): Promise<void>` - POST `/api/sessions/{sessionId}/hide` - Hides a single session from UI

**API Base**: `/api`

**Auth Headers**: Reads token directly from localStorage; passes in `Authorization: Bearer {token}` header if present

**Implementation**: Simple endpoint wrapper; no response body expected (void return)

**Error Handling**: Parses error response to extract `error.error` message

**Usage**: Called when user closes/archives a session; session remains active but hidden from visible list

---

### BacklogService.ts

**Purpose**: Feature request and backlog item management.

**Key Functions**:
- `getBacklogItems(status?: BacklogStatus): Promise<BacklogItem[]>` - GET `/api/backlog` or `/api/backlog?status={status}` - Retrieves backlog items, optionally filtered by status
- `getBacklogStats(): Promise<BacklogStats>` - GET `/api/backlog/stats` - Retrieves aggregate backlog statistics
- `createBacklogItem(item: CreateBacklogItemRequest): Promise<BacklogItem>` - POST `/api/backlog` - Creates new backlog item
- `updateBacklogItem(id: string, updates: UpdateBacklogItemRequest): Promise<BacklogItem>` - PUT `/api/backlog/{id}` - Updates backlog item fields (status, priority, etc.)
- `deleteBacklogItem(id: string): Promise<void>` - DELETE `/api/backlog/{id}` - Deletes backlog item
- `exportBacklogMarkdown(): Promise<string>` - GET `/api/backlog/export` - Exports backlog as Markdown; service returns `result.markdown` string

**API Base**: `import.meta.env.VITE_API_URL || 'http://localhost:3000'` - Vite environment variable with fallback

**Auth Headers**: Uses internal `fetchWithAuth()` helper which reads token from localStorage key `'token'` (note: different from other services!)

**Implementation Details**:
- Helper function `fetchWithAuth(url, options)` centralizes auth header logic
- Gracefully handles JSON parse errors on error responses via `.catch(() => ({ error: 'Request failed' }))`
- All endpoints routed via `/api/backlog` prefix

**Error Handling**: Parses error response, displays `error.error` message or generic fallback

---

### TodoService.ts

**Purpose**: Workspace-scoped todo item management.

**Key Functions**:
- `fetchTodos(workspaceId: string): Promise<Todo[]>` - GET `/api/workspaces/{workspaceId}/todos` - Retrieves todos for workspace
- `createTodo(workspaceId: string, request: CreateTodoRequest): Promise<Todo>` - POST `/api/workspaces/{workspaceId}/todos` - Creates todo in workspace
- `updateTodo(workspaceId: string, todoId: string, request: UpdateTodoRequest): Promise<Todo>` - PUT `/api/workspaces/{workspaceId}/todos/{todoId}` - Updates todo
- `deleteTodo(workspaceId: string, todoId: string): Promise<void>` - DELETE `/api/workspaces/{workspaceId}/todos/{todoId}` - Deletes todo

**API Base**: `/api`

**Auth Headers**: Uses `getAuthHeaders()` helper for POST/PUT; reads token directly for DELETE

**Response Parsing**:
- Create/update return `{ todo: Todo }` wrapper; service extracts `.todo` field
- Fetch returns `{ todos: Todo[] }` wrapper; service extracts `.todos` array

**Error Handling**:
- POST/PUT catch and parse error response normally
- DELETE handles empty response gracefully: reads as text, only parses if content exists, falls back to generic error

**Usage**: Todos are always scoped to a workspace; no global todo list exists

---

### PersistenceService.ts

**Purpose**: Client-side state persistence via localStorage with versioning and migration support.

**Key Functions**:

**State Management**:
- `loadState(): PersistedState` - Reads from localStorage, handles version migration, returns default state on error
- `saveState(state: PersistedState): void` - Writes to localStorage, silently fails if storage full

**Last Viewed Session**:
- `getLastViewedSessionId(): string | null` - Returns ID of last viewed session
- `setLastViewedSessionId(sessionId: string | null): void` - Records current session view

**Favorites**:
- `getFavorites(): string[]` - Returns array of favorite session IDs
- `addFavorite(sessionId: string): void` - Adds session to favorites (no duplicates)
- `removeFavorite(sessionId: string): void` - Removes session from favorites
- `isFavorite(sessionId: string): boolean` - Checks if session is favorite

**Session History**:
- `getSessionHistory(): HistoryEntry[]` - Returns chronological session view history
- `addToHistory(session: Session): void` - Adds or updates session in history; keeps only 50 most recent
- `removeFromHistory(sessionId: string): void` - Removes session from history

**Project Collapse State**:
- `getCollapsedProjectIds(): string[]` - Returns list of collapsed project IDs
- `isProjectCollapsed(projectId: string): boolean` - Checks if project is collapsed
- `toggleProjectCollapsed(projectId: string): void` - Toggles collapse state for project

**Workspace Collapse State**:
- `getCollapsedWorkspaceIds(): Set<string>` - Returns Set of collapsed workspace IDs
- `setCollapsedWorkspaceIds(ids: Set<string>): void` - Replaces entire collapsed workspace set
- `toggleWorkspaceCollapsed(workspaceId: string): void` - Toggles collapse state for workspace

**Cleanup**:
- `clearAll(): void` - Removes all persisted state (used on logout)

**Storage Key**: `'session-manager-persistence'`

**Implementation Details**:
- Current version: 3
- Versioning: Handles migration from v1→v2 and v2→v3 automatically
  - v1→v2: Adds `collapsedProjectIds` and `collapsedWorkspaceIds` fields
  - v2→v3: Renames `collapsedProjectIds` to `collapsedWorkspaceIds`
- Unknown version defaults to fresh state
- Silently fails on localStorage errors (quota exceeded, etc.)
- History limited to 50 entries; oldest entries pruned

**Type: PersistedState**:
```typescript
interface PersistedState {
  version: number;
  lastViewedSessionId: string | null;
  favoriteSessionIds: string[];
  sessionHistory: HistoryEntry[];
  collapsedProjectIds: string[];      // v1+
  collapsedWorkspaceIds: string[];    // v3+ (replaces collapsedProjectIds)
}

interface HistoryEntry {
  sessionId: string;
  sessionName: string;
  hostDisplayName: string;
  isClaudeSession: boolean;
  createdAt: string;         // ISO 8601
  terminatedAt: string | null;
  lastSeenAt: string;        // ISO 8601
}
```

**Usage**: Automatically called by components to save/restore UI state across page reloads

---

## Common Patterns

### Authentication Flow
```typescript
// All services follow this pattern:
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('session-manager-token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
```

**Exception**: BacklogService uses localStorage key `'token'` instead of `'session-manager-token'`

### Error Handling Pattern
```typescript
// Try to parse error response
if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error || 'Failed to {action}');
}
```

**For DELETE**: Check for response content before parsing (some endpoints return no body):
```typescript
const text = await response.text();
if (text) {
  const error = JSON.parse(text);
  throw new Error(error.error || 'Failed to delete');
}
throw new Error('Failed to delete');
```

### Response Wrapper Extraction
Some endpoints return wrapped responses that need field extraction:
- `{ workspaces: Workspace[] }` → extract `.workspaces`
- `{ workspace: Workspace }` → extract `.workspace`
- `{ todos: Todo[] }` → extract `.todos`
- `{ todo: Todo }` → extract `.todo`

Services handle extraction internally; callers receive unwrapped data.

## Token Management

**Storage**: All services read from `localStorage.getItem('session-manager-token')` (except BacklogService which uses `'token'`)

**JWT Expiry**: AuthService decodes JWT client-side; no server round-trip needed for validity check

**Token Refresh**: Not implemented; token must be set via login endpoint or environment variable

**Logout**: Clears token and all persisted state, triggers page reload

## Environment Configuration

**Backend API Base URL**:
- WorkspaceService, HostService, SessionService, TodoService: hardcoded `/api`
- BacklogService: reads `VITE_API_URL` environment variable with fallback to `http://localhost:3000`

**Vite Config**: Frontend uses `import.meta.env` for environment variable access; requires `VITE_` prefix

## Usage Examples

### Fetch and manage workspaces
```typescript
import { fetchWorkspaces, createWorkspace } from '@/services/WorkspaceService';

const workspaces = await fetchWorkspaces();
const newWorkspace = await createWorkspace({ name: 'Project A' });
```

### Check authentication status
```typescript
import { isAuthenticated, logout } from '@/services/AuthService';

if (!isAuthenticated()) {
  logout();
}
```

### Save session view history
```typescript
import { addToHistory, getSessionHistory } from '@/services/PersistenceService';
import { useEffect } from 'react';

useEffect(() => {
  if (currentSession) {
    addToHistory(currentSession);
  }
}, [currentSession]);

const history = getSessionHistory();
```

### Create and manage todos
```typescript
import { fetchTodos, createTodo, updateTodo } from '@/services/TodoService';

const todos = await fetchTodos(workspaceId);
const newTodo = await createTodo(workspaceId, { title: 'Task 1' });
await updateTodo(workspaceId, todoId, { completed: true });
```

## For AI Agents

### Understanding Service Boundaries

- **WorkspaceService**: Handles workspace metadata and session-to-workspace relationships
- **HostService**: Read-only host list (host CRUD handled by backend; this is discovery only)
- **SessionService**: Low-level session visibility control
- **AuthService**: Token lifecycle and authentication state
- **BacklogService**: Feature request tracking (separate from todos/workspaces)
- **TodoService**: Task management within workspaces
- **PersistenceService**: Client-side UI state (no backend involved)

### When Modifying Services

1. **Adding a new endpoint**: Add typed async function, handle auth headers, parse response wrapper if needed
2. **Changing token storage key**: Update all services (note BacklogService uses different key!)
3. **Adding new persisted state**: Update `PersistedState` interface and migrate version
4. **Testing API changes**: Update service, verify response type matches, check error paths

### Common Issues

- **Token key mismatch**: BacklogService reads from `'token'` while others use `'session-manager-token'` - potential source of auth bugs
- **Wrapper extraction**: Services extract wrapped responses; forgetting this causes type errors in components
- **localStorage errors**: Services silently fail on quota/permission errors; consider fallback for critical data
- **Version migration**: When adding new persisted fields, implement migration in `loadState()`

<!-- MANUAL: Review when adding new API endpoints, changing authentication mechanism, or modifying localStorage schema. Each service should follow established patterns for consistency. -->
