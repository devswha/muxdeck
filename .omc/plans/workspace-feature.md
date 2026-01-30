# Workspace Feature Implementation Plan

## Context

### Original Request
Modify the "New Project" button to create **Workspaces** instead of just being a renamed "New Session" button. Workspaces should be first-class persistent entities, not just virtual groupings by working directory.

### Current Architecture Analysis
- **Projects are virtual**: Currently computed client-side via `groupSessionsByProject()` in `/frontend/src/types/Project.ts`
- **Project ID format**: `${hostId}:${workingDirectory}` - derived from session data, not stored
- **No persistence**: Projects disappear when sessions are closed
- **Session-centric model**: Everything revolves around tmux sessions; no workspace concept exists
- **Storage**: Frontend uses localStorage via `PersistenceService.ts`; backend has no persistent storage layer
- **SessionDiscoveryService**: Uses `managedSessions: Set<string>` to track which sessions are "managed" (user-added)

### Key Files Identified
| File | Purpose | Lines |
|------|---------|-------|
| `/frontend/src/types/Project.ts` | Virtual project grouping logic | 1-62 |
| `/frontend/src/types/Session.ts` | Session type definitions | 1-66 |
| `/src/types/Session.ts` | Backend session types | 1-71 |
| `/frontend/src/components/SessionControls.tsx` | "+ New Project" button | 1-24 |
| `/frontend/src/components/NewSessionDialog.tsx` | Session creation dialog | 1-277 |
| `/frontend/src/components/ProjectGrid.tsx` | Renders project groups | 1-82 |
| `/frontend/src/App.tsx` | Main orchestration | 1-395 |
| `/src/api/sessions.ts` | Backend session API | 1-110 |
| `/src/services/SessionManager.ts` | Session creation logic | 1-173 |
| `/src/services/SessionDiscoveryService.ts` | Session discovery & managed tracking | 1-325 |
| `/frontend/src/services/PersistenceService.ts` | localStorage persistence | 1-168 |

---

## Work Objectives

### Core Objective
Transform the ephemeral "Project" concept into first-class persistent **Workspaces** that users explicitly create, name, and manage.

### Deliverables
1. **Workspace data model** with persistent storage
2. **Backend API** for workspace CRUD operations
3. **Backend API** for session-workspace reassignment
4. **Frontend components** for workspace management
5. **Session-to-workspace assignment** mechanism
6. **Migration path** for existing users

### Definition of Done
- [ ] User can create a named workspace via "New Workspace" button
- [ ] Workspaces persist across browser refreshes and server restarts
- [ ] Sessions can be assigned to workspaces during creation
- [ ] Sessions can be moved between workspaces via API
- [ ] Empty workspaces remain visible until explicitly deleted
- [ ] Existing sessions are migrated to a "Default" workspace
- [ ] All existing functionality (session creation, terminal, etc.) continues to work

---

## Guardrails

### Must Have
- Workspaces persist to disk (not just localStorage)
- Workspace names are user-defined (not derived from paths)
- Sessions explicitly belong to a workspace
- Backwards compatibility with existing session data
- Clean separation between workspace and session concepts

### Must NOT Have
- No automatic workspace creation from working directories
- No breaking changes to existing session API
- No removal of working directory field from sessions
- No complex database setup (SQLite or JSON file is sufficient)

---

## Data Flow Architecture (CRITICAL CLARIFICATION)

### Storage Design

**Two JSON files for separation of concerns:**

| File | Purpose | Contents |
|------|---------|----------|
| `~/.session-manager/workspaces.json` | Workspace entities | `{ workspaces: Workspace[] }` |
| `~/.session-manager/session-workspaces.json` | Session-to-workspace mapping | `{ mappings: { [sessionId]: workspaceId } }` |

**Why two files?**
- Workspaces are independent entities with their own lifecycle
- Session-workspace mappings change frequently (sessions come and go)
- Avoids coupling workspace CRUD with session state changes

### Data Structure Changes in SessionDiscoveryService

**Current:**
```typescript
private managedSessions: Set<string> = new Set();
```

**Changed to:**
```typescript
private sessionWorkspaceMap: Map<string, string | null> = new Map();
// Key: sessionId, Value: workspaceId (null = ungrouped but managed)
```

**Why Map instead of Set?**
- Map stores BOTH "is managed" status AND workspace assignment
- A sessionId in the Map = managed session
- Value of `null` = managed but ungrouped
- Value of `workspaceId` = managed and assigned to workspace

### How Sessions Get `workspaceId` Populated

1. **On session creation**: `SessionManager.createSession()` receives `workspaceId`, stores mapping via `SessionDiscoveryService.setSessionWorkspace(sessionId, workspaceId)`
2. **On session discovery refresh**: `SessionDiscoveryService.getManagedSessions()` enriches each `Session` object with `workspaceId` from the internal `sessionWorkspaceMap`
3. **On reassignment**: `PUT /api/sessions/:id/workspace` calls `SessionDiscoveryService.setSessionWorkspace()` and persists to `session-workspaces.json`

### API Flow Diagram

```
[Create Session with workspaceId]
    |
    v
SessionManager.createSession({ workspaceId })
    |
    v
SessionDiscoveryService.addManagedSession(sessionId)
SessionDiscoveryService.setSessionWorkspace(sessionId, workspaceId)
    |
    v
Persists to session-workspaces.json
    |
    v
getManagedSessions() returns Session[] with workspaceId populated

[Reassign Session to Different Workspace]
    |
    v
PUT /api/sessions/:id/workspace { workspaceId }
    |
    v
SessionDiscoveryService.setSessionWorkspace(sessionId, workspaceId)
    |
    v
Persists to session-workspaces.json
    |
    v
Frontend refetches sessions, sees new workspaceId
```

---

## Task Flow and Dependencies

```
[1] Data Model Design
    |
    v
[2] Backend Storage Layer -----> [3] Backend API Routes (Workspaces)
    |                                   |
    |                                   v
    +----------------------------> [4] Backend API (Session Reassignment)
    |                                   |
    v                                   v
[5] Frontend Types & Services    [6] Frontend Components
    |                                   |
    +-----------------------------------+
                    |
                    v
             [7] Migration Logic
                    |
                    v
             [8] Integration & Testing
```

---

## Detailed TODOs

### Phase 1: Data Model & Backend Storage

#### TODO 1.1: Create Workspace Type Definitions
**File**: `/src/types/Workspace.ts` (NEW)
**Acceptance Criteria**:
- Define `Workspace` interface with: `id`, `name`, `description?`, `createdAt`, `updatedAt`
- Define `CreateWorkspaceRequest` and `UpdateWorkspaceRequest` types
- Export all types

```typescript
// Expected structure:
export interface Workspace {
  id: string;           // UUID
  name: string;         // User-defined name
  description?: string; // Optional description
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
}
```

#### TODO 1.2: Create WorkspaceStorage Service
**File**: `/src/services/WorkspaceStorage.ts` (NEW)
**Acceptance Criteria**:
- Store workspaces in JSON file at `~/.session-manager/workspaces.json`
- Implement CRUD operations: `getAll()`, `getById()`, `create()`, `update()`, `delete()`
- Handle file creation if doesn't exist
- Thread-safe writes (atomic file operations)

#### TODO 1.3: Add workspaceId to Session Types
**File**: `/src/types/Session.ts` (MODIFY lines 39-51)
**Acceptance Criteria**:
- Add `workspaceId: string | null` to `Session` interface
- Add `workspaceId?: string` to `CreateSessionRequest`
- Default to `null` for backwards compatibility

**File**: `/frontend/src/types/Session.ts` (MODIFY lines 27-39)
**Acceptance Criteria**:
- Mirror backend changes: add `workspaceId: string | null` to `Session` interface

---

### Phase 2: Backend API

#### TODO 2.1: Create Workspace API Routes
**File**: `/src/api/workspaces.ts` (NEW)
**Acceptance Criteria**:
- `GET /api/workspaces` - List all workspaces
- `GET /api/workspaces/:id` - Get single workspace
- `POST /api/workspaces` - Create workspace (body: `{ name, description? }`)
- `PUT /api/workspaces/:id` - Update workspace
- `DELETE /api/workspaces/:id` - Delete workspace (only if no sessions assigned)
- Proper validation and error responses

#### TODO 2.2: Register Workspace Routes
**File**: `/src/server/app.ts` (MODIFY)
**Acceptance Criteria**:
- Import and register `workspaceRoutes`
- Place before session routes

#### TODO 2.3: Update Session Creation for Workspace Assignment
**File**: `/src/services/SessionManager.ts` (MODIFY lines 11-80)
**Acceptance Criteria**:
- Accept `workspaceId` in `createSession()` request
- After creating session, call `sessionDiscoveryService.setSessionWorkspace(sessionId, workspaceId)`

**File**: `/src/api/sessions.ts` (MODIFY lines 46-68)
**Acceptance Criteria**:
- Add `workspaceId` to create session schema (optional string)
- Pass `workspaceId` to `sessionManager.createSession()`

#### TODO 2.4: Refactor SessionDiscoveryService for Workspace Tracking
**File**: `/src/services/SessionDiscoveryService.ts` (MODIFY)
**Acceptance Criteria**:
- **Change data structure**: Replace `managedSessions: Set<string>` with `sessionWorkspaceMap: Map<string, string | null>`
- **Add persistence**: Load/save mappings from `~/.session-manager/session-workspaces.json`
- **Add methods**:
  - `setSessionWorkspace(sessionId: string, workspaceId: string | null): void` - Updates map and persists
  - `getSessionWorkspace(sessionId: string): string | null` - Returns workspaceId for session
  - `getSessionsInWorkspace(workspaceId: string): string[]` - Returns sessionIds in workspace
- **Update `addManagedSession()`**: Now takes optional `workspaceId` parameter
- **Update `getManagedSessions()`**: Enriches returned `Session[]` with `workspaceId` from map
- **Update `removeManagedSession()`**: Also removes from `sessionWorkspaceMap`
- **Backwards compatibility**: Sessions in map with `null` value = managed but ungrouped

**File format for `~/.session-manager/session-workspaces.json`:**
```json
{
  "version": 1,
  "mappings": {
    "local:$1:%0": "workspace-uuid-123",
    "local:$2:%0": null
  }
}
```

#### TODO 2.5: Create Session-Workspace Reassignment Endpoint (NEW)
**File**: `/src/api/sessions.ts` (MODIFY)
**Acceptance Criteria**:
- Add `PUT /api/sessions/:id/workspace` endpoint
- Request body: `{ workspaceId: string | null }` (null = move to ungrouped)
- Validate session exists and is managed
- Validate workspace exists (if workspaceId provided)
- Call `sessionDiscoveryService.setSessionWorkspace(sessionId, workspaceId)`
- Return updated session object
- Error responses:
  - 404 if session not found
  - 404 if workspace not found (when workspaceId provided)
  - 400 if session not managed

```typescript
// Expected endpoint implementation:
sessionsRouter.put('/:id/workspace', async (req, res) => {
  const { id } = req.params;
  const { workspaceId } = req.body; // string | null

  // Validate session exists and is managed
  const session = sessionDiscoveryService.getSession(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!sessionDiscoveryService.isManagedSession(id)) {
    return res.status(400).json({ error: 'Session is not managed' });
  }

  // Validate workspace exists (if provided)
  if (workspaceId) {
    const workspace = await workspaceStorage.getById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
  }

  // Update mapping
  sessionDiscoveryService.setSessionWorkspace(id, workspaceId);

  // Return updated session
  const updatedSession = sessionDiscoveryService.getSession(id);
  return res.json(updatedSession);
});
```

---

### Phase 3: Frontend Types & Services

#### TODO 3.1: Create Frontend Workspace Types
**File**: `/frontend/src/types/Workspace.ts` (NEW)
**Acceptance Criteria**:
- Mirror backend `Workspace` interface
- Add `sessions: Session[]` for UI grouping convenience

#### TODO 3.2: Update Project.ts to Use Workspaces
**File**: `/frontend/src/types/Project.ts` (MODIFY)
**Acceptance Criteria**:
- Rename file to `Workspace.ts` OR keep and add workspace-aware grouping
- Add `groupSessionsByWorkspace()` function that:
  - Groups sessions by `workspaceId`
  - Sessions with `workspaceId: null` go to "Ungrouped" section
- Keep `groupSessionsByProject()` for backwards compatibility during transition

#### TODO 3.3: Create Workspace API Service
**File**: `/frontend/src/services/WorkspaceService.ts` (NEW)
**Acceptance Criteria**:
- `fetchWorkspaces(): Promise<Workspace[]>`
- `createWorkspace(name, description?): Promise<Workspace>`
- `updateWorkspace(id, updates): Promise<Workspace>`
- `deleteWorkspace(id): Promise<void>`
- `assignSessionToWorkspace(sessionId, workspaceId): Promise<Session>` - calls `PUT /api/sessions/:id/workspace`
- Handle auth token inclusion

#### TODO 3.4: Update PersistenceService
**File**: `/frontend/src/services/PersistenceService.ts` (MODIFY)
**Acceptance Criteria**:
- Update `collapsedProjectIds` to `collapsedWorkspaceIds`
- Add version migration (version 2 -> 3)

---

### Phase 4: Frontend Components

#### TODO 4.1: Create NewWorkspaceDialog Component
**File**: `/frontend/src/components/NewWorkspaceDialog.tsx` (NEW)
**Acceptance Criteria**:
- Modal dialog with name input (required) and description input (optional)
- Validation: name required, max 50 chars
- Submit creates workspace via API
- Loading and error states

#### TODO 4.2: Update SessionControls
**File**: `/frontend/src/components/SessionControls.tsx` (MODIFY)
**Acceptance Criteria**:
- Change "+ New Project" button to "+ New Workspace"
- Update `onNewSession` prop to `onNewWorkspace`

#### TODO 4.3: Update NewSessionDialog for Workspace Selection
**File**: `/frontend/src/components/NewSessionDialog.tsx` (MODIFY)
**Acceptance Criteria**:
- Add workspace dropdown (fetch workspaces on open)
- Pass `workspaceId` to `onCreate` callback
- Update `onCreate` prop signature: `(workingDirectory, sessionName?, hostId?, workspaceId?) => Promise<void>`

#### TODO 4.4: Create WorkspaceGrid Component
**File**: `/frontend/src/components/WorkspaceGrid.tsx` (NEW)
**Acceptance Criteria**:
- Replace `ProjectGrid` usage in App
- Fetch workspaces and group sessions by `workspaceId`
- Show "Ungrouped" section for sessions with `workspaceId: null`
- Support collapse/expand per workspace
- Support drag-drop session between workspaces (stretch goal)

#### TODO 4.5: Create WorkspaceGroup Component
**File**: `/frontend/src/components/WorkspaceGroup.tsx` (NEW)
**Acceptance Criteria**:
- Similar to `ProjectGroup` but for workspaces
- Show workspace name (editable on double-click?)
- Show session count
- "+ Add Session" button pre-selects this workspace
- Delete workspace button (only if empty)

#### TODO 4.6: Update App.tsx
**File**: `/frontend/src/App.tsx` (MODIFY)
**Acceptance Criteria**:
- Add workspace state management
- Fetch workspaces on mount
- Replace `ProjectGrid` with `WorkspaceGrid`
- Add `handleCreateWorkspace` callback
- Add `NewWorkspaceDialog` with open state
- Update `handleCreateSession` to include `workspaceId`

#### TODO 4.7: Remove or Deprecate ProjectGrid.tsx
**File**: `/frontend/src/components/ProjectGrid.tsx` (DELETE or DEPRECATE)
**Acceptance Criteria**:
- Once WorkspaceGrid is complete and tested, remove ProjectGrid.tsx
- If keeping for fallback, add deprecation comment

---

### Phase 5: Migration & Compatibility

#### TODO 5.1: Backend Migration Script
**File**: `/src/services/MigrationService.ts` (NEW)
**Acceptance Criteria**:
- Run on server startup
- Create "Default" workspace if no workspaces exist
- Assign all existing managed sessions to "Default" workspace
- One-time migration flag in `~/.session-manager/migration.json`

#### TODO 5.2: Frontend Migration
**File**: `/frontend/src/services/PersistenceService.ts` (MODIFY)
**Acceptance Criteria**:
- Migrate `collapsedProjectIds` to `collapsedWorkspaceIds`
- Version bump to 3

---

### Phase 6: Testing

#### TODO 6.1: Backend API Tests
**Acceptance Criteria**:
- Test workspace CRUD operations
- Test session-workspace assignment on creation
- Test session-workspace reassignment endpoint
- Test workspace deletion blocked when sessions exist
- Test migration creates Default workspace

#### TODO 6.2: Frontend Integration Tests
**Acceptance Criteria**:
- Test workspace creation flow
- Test session creation with workspace selection
- Test session drag-drop between workspaces (if implemented)
- Test persistence across refresh

---

## File Change Summary

### New Files (10)
| File | Purpose |
|------|---------|
| `/src/types/Workspace.ts` | Backend workspace types |
| `/src/services/WorkspaceStorage.ts` | Workspace persistence |
| `/src/api/workspaces.ts` | Workspace API routes |
| `/src/services/MigrationService.ts` | Migration logic |
| `/frontend/src/types/Workspace.ts` | Frontend workspace types |
| `/frontend/src/services/WorkspaceService.ts` | Workspace API client |
| `/frontend/src/components/NewWorkspaceDialog.tsx` | Workspace creation dialog |
| `/frontend/src/components/WorkspaceGrid.tsx` | Workspace-based grid |
| `/frontend/src/components/WorkspaceGroup.tsx` | Single workspace display |
| `~/.session-manager/session-workspaces.json` | Session-workspace mappings (created at runtime) |

### Modified Files (9)
| File | Changes |
|------|---------|
| `/src/types/Session.ts` | Add `workspaceId` field |
| `/src/services/SessionManager.ts` | Accept `workspaceId` in creation, call setSessionWorkspace |
| `/src/services/SessionDiscoveryService.ts` | Replace Set with Map, add workspace tracking methods, persist mappings |
| `/src/api/sessions.ts` | Add `workspaceId` to schema, add PUT /:id/workspace endpoint |
| `/src/server/app.ts` | Register workspace routes |
| `/frontend/src/types/Session.ts` | Add `workspaceId` field |
| `/frontend/src/types/Project.ts` | Add workspace-aware grouping |
| `/frontend/src/components/SessionControls.tsx` | Rename button |
| `/frontend/src/components/NewSessionDialog.tsx` | Add workspace selector |
| `/frontend/src/services/PersistenceService.ts` | Version migration |
| `/frontend/src/App.tsx` | Workspace state, new dialog |

### Deleted Files (1)
| File | Reason |
|------|--------|
| `/frontend/src/components/ProjectGrid.tsx` | Replaced by WorkspaceGrid.tsx |

---

## Commit Strategy

### Commit 1: Backend Data Model
- Add `/src/types/Workspace.ts`
- Add `/src/services/WorkspaceStorage.ts`
- Modify `/src/types/Session.ts` (add workspaceId)

### Commit 2: Backend API (Workspaces)
- Add `/src/api/workspaces.ts`
- Modify `/src/server/app.ts`

### Commit 3: Backend Session-Workspace Integration
- Modify `/src/services/SessionDiscoveryService.ts` (Map refactor, persistence, new methods)
- Modify `/src/api/sessions.ts` (add workspaceId to create, add PUT /:id/workspace)
- Modify `/src/services/SessionManager.ts` (pass workspaceId)

### Commit 4: Frontend Types & Services
- Add `/frontend/src/types/Workspace.ts`
- Add `/frontend/src/services/WorkspaceService.ts`
- Modify `/frontend/src/types/Session.ts`
- Modify `/frontend/src/types/Project.ts`
- Modify `/frontend/src/services/PersistenceService.ts`

### Commit 5: Frontend Components
- Add `/frontend/src/components/NewWorkspaceDialog.tsx`
- Add `/frontend/src/components/WorkspaceGrid.tsx`
- Add `/frontend/src/components/WorkspaceGroup.tsx`
- Modify `/frontend/src/components/SessionControls.tsx`
- Modify `/frontend/src/components/NewSessionDialog.tsx`
- Modify `/frontend/src/App.tsx`
- Delete `/frontend/src/components/ProjectGrid.tsx`

### Commit 6: Migration
- Add `/src/services/MigrationService.ts`
- Integration and testing fixes

---

## Success Criteria

| Criterion | Verification Method |
|-----------|---------------------|
| Workspaces persist across server restart | Create workspace, restart server, verify exists |
| Sessions assigned to workspaces on creation | Create session in workspace, verify grouping |
| Sessions can be reassigned to different workspace | Call PUT /api/sessions/:id/workspace, verify moved |
| Empty workspaces remain visible | Create empty workspace, verify displayed |
| Migration creates Default workspace | Start with no workspaces, verify Default created |
| Existing sessions migrated | Have sessions before migration, verify assigned to Default |
| All existing features work | Manual testing of session create/attach/terminal |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | HIGH | Backup before migration, test thoroughly |
| Breaking existing session API | MEDIUM | Backwards compatible: workspaceId optional |
| Complex state management | MEDIUM | Keep workspace state separate from session state |
| File locking issues | LOW | Use atomic writes, single-server assumption |
| Race conditions in Map updates | MEDIUM | Synchronous updates, persist after each change |

---

## Estimated Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1: Data Model | 3 | 1-2 hours |
| Phase 2: Backend API | 5 | 3-4 hours |
| Phase 3: Frontend Services | 4 | 1-2 hours |
| Phase 4: Frontend Components | 7 | 3-4 hours |
| Phase 5: Migration | 2 | 1 hour |
| Phase 6: Testing | 2 | 1-2 hours |
| **Total** | **23** | **10-15 hours** |

---

*Plan generated by Prometheus planner agent*
*Updated to address Critic feedback (iteration 2)*
