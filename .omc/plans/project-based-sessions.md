# Project-Based Session Management

## Context

### Original Request
Change from flat session list to project-based hierarchy where sessions are grouped by their working directory (project).

### Current Architecture
- **Backend**: Node.js + TypeScript + Fastify + WebSocket
- **Frontend**: React + TypeScript + Tailwind + xterm.js
- **Session Model**: Flat list of tmux sessions with no project grouping
- **Key Pattern**: Sessions are discovered via `SessionDiscoveryService`, managed via `SessionManager`
- **Storage**: Frontend uses localStorage for persistence (favorites, history)
- **Pane Model**: Each tmux pane is treated as a separate Session object (see SessionDiscoveryService.ts lines 60-99 for local, 133-166 for remote)

### Desired State
```
Project A (/home/user/project-a)
  ├── Session 1 (tmux: claude-1234)
  ├── Session 2 (tmux: feature-branch)
Project B (/home/user/project-b)
  └── Session 3 (tmux: main-dev)
Ungrouped
  └── Session 4 (no working directory detected)
```

---

## Work Objectives

### Core Objective
Transform the Session Manager from a flat session list to a hierarchical project-based view where terminal sessions are organized under their respective project directories.

### Deliverables
1. **New `Project` type and API** - Backend types and endpoints for project management
2. **Enhanced Session type** - Add `workingDirectory` to Session model
3. **Project detection logic** - Automatically detect/extract working directory from tmux sessions
4. **Grouped UI components** - New `ProjectGroup` component with collapsible session list
5. **Project persistence** - Save project metadata (name, collapsed state) in localStorage
6. **Create session in project** - "New Session" button at project level

### Definition of Done
- [ ] Sessions are visually grouped by project (working directory)
- [ ] Projects can be collapsed/expanded
- [ ] New sessions can be created within a specific project
- [ ] Projects display session count and aggregate status
- [ ] Working directory is detected from tmux pane's current path
- [ ] Ungrouped sessions (no detectable working directory) are shown in "Other" section
- [ ] All existing functionality (favorites, history, terminal view) continues to work

---

## Must Have / Must NOT Have

### Must Have
- Working directory detection from tmux panes
- Project grouping in UI with collapse/expand
- Project-level "Add Session" action
- Backward compatible with existing sessions
- Project name derived from directory basename

### Must NOT Have
- Manual project creation (projects are auto-detected from sessions)
- Project deletion (projects disappear when all sessions are gone)
- Persistent project storage in backend (frontend-only grouping)
- Complex project settings or configuration
- Cross-host project grouping (projects are per-host)

---

## Task Flow and Dependencies

```
Phase 1: Backend - Working Directory Detection
  └── Task 1.1: Add workingDirectory to Session type
  └── Task 1.2: Implement tmux pane_current_path extraction
  └── Task 1.3: Update SessionDiscoveryService to populate workingDirectory

Phase 2: Frontend Types & State
  └── Task 2.1: Update frontend Session type
  └── Task 2.2: Create Project type and grouping utility
  └── Task 2.3: Add project state to PersistenceService (collapsed state)

Phase 3: UI Components
  └── Task 3.1: Create ProjectGroup component
  └── Task 3.2: Create ProjectHeader component (with collapse toggle)
  └── Task 3.3: Refactor SessionGrid to ProjectGrid
  └── Task 3.4: Update App.tsx to use new grid

Phase 4: Project-Level Actions
  └── Task 4.1: Add "New Session" button to ProjectHeader
  └── Task 4.2: Update NewSessionDialog to accept pre-filled workingDirectory
  └── Task 4.3: Wire up project-level session creation
```

---

## Detailed TODOs

### Phase 1: Backend - Working Directory Detection

#### Task 1.1: Add workingDirectory to Session type
**File:** `src/types/Session.ts`

**Changes:**
- Add `workingDirectory: string | null` to `Session` interface
- This field will hold the absolute path of the tmux pane's current directory

**Acceptance Criteria:**
- [ ] Session interface includes workingDirectory field
- [ ] TypeScript compiles without errors

---

#### Task 1.2: Implement tmux pane_current_path extraction
**File:** `src/utils/tmux.ts`

**Changes:**
- Add `#{pane_current_path}` to the pane format string in `listTmuxPanes` (line 49)
- Update `TmuxPane` interface to include `currentPath: string`
- Parse the current path from tmux output

**Technical Details:**
```bash
# tmux format variable for current path
#{pane_current_path}
```

**Acceptance Criteria:**
- [ ] TmuxPane type includes currentPath field
- [ ] listTmuxPanes returns current working directory for each pane

---

#### Task 1.3: Update SessionDiscoveryService to populate workingDirectory
**File:** `src/services/SessionDiscoveryService.ts`

**Changes:**
- In `processTmuxSessions`, populate `workingDirectory` from pane's currentPath
- In `processTmuxSessionsRemote`, populate `workingDirectory` from pane's currentPath
- **IMPORTANT:** Update the remote pane format string (line 110) to include `#{pane_current_path}` - this is a SEPARATE format string from tmux.ts and must be updated independently

**Multi-Pane Behavior:**
Each tmux pane is treated as an independent Session object. If a tmux session has multiple panes with different working directories, each pane will appear in its respective project based on that pane's `workingDirectory`. For example:
- tmux session "dev" with pane 1 in `/home/user/project-a` → appears under "project-a"
- tmux session "dev" with pane 2 in `/home/user/project-b` → appears under "project-b"

This is the existing behavior (one Session per pane) and will naturally result in correct project grouping.

**File Locations Summary:**
| Location | File | Line | Purpose |
|----------|------|------|---------|
| Local panes | `src/utils/tmux.ts` | 49 | Format string for local tmux pane discovery |
| Remote panes | `src/services/SessionDiscoveryService.ts` | 110 | Format string for remote SSH pane discovery |

**Acceptance Criteria:**
- [ ] Local sessions have workingDirectory populated
- [ ] Remote sessions have workingDirectory populated
- [ ] Sessions without detectable path have `workingDirectory: null`
- [ ] Both format strings (local and remote) include `#{pane_current_path}`

---

### Phase 2: Frontend Types & State

#### Task 2.1: Update frontend Session type
**File:** `frontend/src/types/Session.ts`

**Changes:**
- Add `workingDirectory: string | null` to Session interface
- Keep in sync with backend type

**Acceptance Criteria:**
- [ ] Frontend Session type matches backend
- [ ] TypeScript compiles without errors

---

#### Task 2.2: Create Project type and grouping utility
**File:** `frontend/src/types/Project.ts` (new file)

**Changes:**
- Create `Project` interface:
  ```typescript
  interface Project {
    id: string;           // hash of workingDirectory or "ungrouped"
    name: string;         // basename of workingDirectory or "Other"
    workingDirectory: string | null;
    hostId: string;
    sessions: Session[];
    isCollapsed: boolean;
  }
  ```
- Create `groupSessionsByProject(sessions: Session[]): Project[]` utility function
- Project ID = `${hostId}:${workingDirectory}` or `${hostId}:ungrouped`

**Sorting Behavior:**
Projects are sorted alphabetically by project name (case-insensitive), with the "Other" project (ungrouped sessions) always appearing last regardless of alphabetical order.

**Acceptance Criteria:**
- [ ] Project type defined
- [ ] groupSessionsByProject correctly groups sessions
- [ ] Sessions with null workingDirectory go to "Other" project
- [ ] Projects are sorted alphabetically by name, with "Other" always last

---

#### Task 2.3: Add project state to PersistenceService
**File:** `frontend/src/services/PersistenceService.ts`

**Changes:**
- Add `collapsedProjectIds: string[]` to PersistedState
- Add functions: `isProjectCollapsed(projectId)`, `toggleProjectCollapsed(projectId)`
- Increment version if needed for migration

**Acceptance Criteria:**
- [ ] Collapsed state persists across page reloads
- [ ] Migration handles old state format gracefully

---

### Phase 3: UI Components

#### Task 3.1: Create ProjectGroup component
**File:** `frontend/src/components/ProjectGroup.tsx` (new file)

**Changes:**
- Create component that renders a project with its sessions
- Props: `project: Project`, `onToggleCollapse`, `onSelectSession`, `renderTerminal`, etc.
- When collapsed, show only header with session count
- When expanded, show header + session tiles in a sub-grid

**Acceptance Criteria:**
- [ ] Project renders with header and session tiles
- [ ] Collapse/expand works correctly
- [ ] Session tiles render within project group

---

#### Task 3.2: Create ProjectHeader component
**File:** `frontend/src/components/ProjectHeader.tsx` (new file)

**Changes:**
- Display project name (directory basename)
- Show session count badge
- Show aggregate status indicator (green if any active, yellow if all idle, etc.)
- Collapse/expand chevron icon
- "Add Session" button (visible on hover or always)
- Full path tooltip on hover

**Visual Design:**
```
[v] project-name (3)  [●]  [+ Add Session]
    ↑ chevron   ↑ count  ↑ status
```

**Acceptance Criteria:**
- [ ] Project name displays correctly
- [ ] Session count is accurate
- [ ] Collapse toggle works
- [ ] Add Session button triggers callback

---

#### Task 3.3: Refactor SessionGrid to ProjectGrid
**File:** `frontend/src/components/ProjectGrid.tsx` (new file, replaces SessionGrid usage)

**Changes:**
- Import groupSessionsByProject utility
- Map sessions to projects
- Render ProjectGroup for each project
- Handle collapse state from persistence

**Props (similar to SessionGrid):**
```typescript
interface ProjectGridProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onViewTerminal?: (session: Session) => void;
  renderTerminal: (session: Session) => React.ReactNode;
  isFavorite?: (sessionId: string) => boolean;
  onToggleFavorite?: (sessionId: string) => void;
  onCloseSession?: (sessionId: string) => void;
  onCreateSessionInProject?: (workingDirectory: string, hostId: string) => void;
}
```

**Acceptance Criteria:**
- [ ] Sessions grouped by project
- [ ] All existing functionality preserved
- [ ] Empty state handled ("No projects found")

---

#### Task 3.4: Update App.tsx to use ProjectGrid
**File:** `frontend/src/App.tsx`

**Changes:**
- Replace `<SessionGrid>` with `<ProjectGrid>`
- Add `handleCreateSessionInProject` callback
- Pass new callback to ProjectGrid

**Acceptance Criteria:**
- [ ] App renders with project-based grid
- [ ] All existing functionality works
- [ ] Create session in project opens dialog with pre-filled directory

---

### Phase 4: Project-Level Actions

#### Task 4.1: Add "New Session" button to ProjectHeader
**File:** `frontend/src/components/ProjectHeader.tsx`

**Changes:**
- Add "+ Add Session" or "+" button
- Call `onAddSession(project.workingDirectory, project.hostId)` on click
- Disable for "Other" project (no working directory)

**Acceptance Criteria:**
- [ ] Button visible on project header
- [ ] Click triggers callback with correct directory
- [ ] Button disabled/hidden for ungrouped project

---

#### Task 4.2: Update NewSessionDialog to accept pre-filled workingDirectory
**File:** `frontend/src/components/NewSessionDialog.tsx`

**Changes:**
- Add optional prop `defaultWorkingDirectory?: string`
- Add optional prop `defaultHostId?: string`
- Pre-fill form fields when props provided
- Allow user to override if needed

**Acceptance Criteria:**
- [ ] Dialog opens with pre-filled directory when provided
- [ ] User can still modify the pre-filled value
- [ ] Behavior unchanged when no default provided

---

#### Task 4.3: Wire up project-level session creation
**File:** `frontend/src/App.tsx`

**Changes:**
- Add state for `newSessionDefaults: { workingDirectory?: string, hostId?: string }`
- Update `handleCreateSessionInProject` to set defaults and open dialog
- Pass defaults to NewSessionDialog
- Clear defaults when dialog closes

**Acceptance Criteria:**
- [ ] Clicking "Add Session" on project opens dialog with that project's directory
- [ ] Session created goes into correct project
- [ ] Dialog clears defaults on close

---

## Commit Strategy

### Commit 1: Backend - Working Directory Detection
- Task 1.1, 1.2, 1.3
- Message: "feat(backend): detect working directory from tmux panes"

### Commit 2: Frontend Types & Utilities
- Task 2.1, 2.2, 2.3
- Message: "feat(frontend): add Project type and grouping utilities"

### Commit 3: UI Components
- Task 3.1, 3.2, 3.3, 3.4
- Message: "feat(ui): implement project-based session grid"

### Commit 4: Project-Level Actions
- Task 4.1, 4.2, 4.3
- Message: "feat(ui): add project-level session creation"

---

## Success Criteria

### Functional
- [ ] Sessions are grouped by working directory in the UI
- [ ] Projects can be collapsed and expanded
- [ ] Collapsed state persists across page reloads
- [ ] New sessions can be created within a specific project
- [ ] "Other" section shows sessions without detectable working directory
- [ ] All existing features continue to work (favorites, history, terminal modal)

### Technical
- [ ] No TypeScript errors
- [ ] Backend API response includes workingDirectory
- [ ] Frontend correctly parses and groups sessions
- [ ] Performance acceptable with many projects/sessions

### UX
- [ ] Clear visual hierarchy: Projects > Sessions
- [ ] Project names are readable (basename, not full path)
- [ ] Full path available on hover/tooltip
- [ ] Intuitive collapse/expand interaction
- [ ] Easy to create new session in specific project

---

## Risk Assessment

### Low Risk
- Type additions are backward compatible (nullable field)
- UI refactor is isolated to grid components
- Persistence changes are additive

### Medium Risk
- Remote session working directory detection may vary by tmux version
- Performance with many projects needs testing

### Mitigation
- Test with multiple tmux versions
- Add fallback for missing pane_current_path
- Use virtualization if performance becomes an issue (future enhancement)

---

## Open Questions (Resolved)

1. **Should projects be manually creatable?** No - auto-detected from sessions only
2. **Cross-host project grouping?** No - projects are per-host to avoid confusion
3. **Project renaming?** No - names derived from directory basename
4. **Empty project cleanup?** Yes - projects with no sessions are not displayed
5. **Multi-pane behavior?** Each pane is treated independently - if panes have different working directories, they appear in their respective projects
