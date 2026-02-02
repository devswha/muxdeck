<!-- Parent: ../AGENTS.md -->

# Components Directory

React functional components using hooks and Tailwind CSS for styling. All components follow a pattern of accepting props interfaces defined inline, using `useState` and `useEffect` for state management, and composing together to form the application UI.

## Component Categories

### Layout & Container Components

#### WorkspaceGrid
- **Purpose**: Top-level grid container rendering all workspaces
- **Props**: Workspaces array, callbacks for collapse/add/delete/rename, session renderer function, drag-drop handlers
- **Key Features**:
  - Maps workspaces to WorkspaceGroup components
  - Passes todo statistics and host information down to children
  - Handles empty state with helpful message
  - Supports drag-over styling for workspace-level drops
- **Dependencies**: WorkspaceGroup, WorkspaceWithSessions type
- **File**: WorkspaceGrid.tsx

#### WorkspaceGroup
- **Purpose**: Individual workspace container with collapsible sessions grid
- **Props**: WorkspaceWithSessions, callbacks for toggle/add/delete/rename, renderSession function, drag-drop handlers, todo counts
- **Key Features**:
  - Collapsible header with chevron icon showing session count
  - Inline workspace name editing with cancel on blur/Escape
  - Inline rename button (appears on hover)
  - Hide/show workspace toggle button
  - Add Session and Delete buttons (appear on hover)
  - Drag-drop support for moving sessions between workspaces
  - WorkspaceInfoButton showing metadata and stats
  - Status indicator for hidden workspaces
- **State**: isEditing, editName
- **Dependencies**: WorkspaceInfoButton
- **File**: WorkspaceGroup.tsx

#### SessionGrid
- **Purpose**: Responsive grid layout for session tiles within a workspace
- **Props**: Sessions array, selected ID, callbacks for select/terminal/favorite/close, terminal renderer, drag-drop
- **Key Features**:
  - Sorts sessions: favorites first, then by lastActivityAt timestamp
  - Responsive grid: 1 col mobile, 2 col tablet, 3-4 cols desktop
  - Drag-drop zone for moving sessions out of workspace (null dropzone)
  - Renders SessionTile children with terminal preview
- **Memoization**: Uses useMemo for sorting optimization
- **File**: SessionGrid.tsx

#### GridLayout
- **Purpose**: Generic grid layout helper with keyboard shortcuts
- **Props**: Children nodes, focusedId, onFocusChange callback
- **Key Features**:
  - ESC key closes focused item
  - Auto-rows for consistent card heights
  - Adapts grid columns based on viewport
- **File**: GridLayout.tsx

### Terminal Components

#### Terminal (TerminalComponent)
- **Purpose**: xterm.js wrapper for displaying and interacting with tmux sessions
- **Props**: sessionId, onInput callback, onResize callback, onReady callback
- **Key Features**:
  - Initializes xterm.js in container ref
  - Filters out DA (Device Attributes) responses to prevent feedback loops
  - Handles terminal resize with IntersectionObserver for visibility changes
  - Provides write/writeln methods via onReady callback
  - Memoized to prevent unnecessary reinitializations
- **Hooks**: useTerminal custom hook for xterm setup
- **Important**: Filters xterm DA responses (ESC [ ? and ESC [ > patterns) to prevent tmux feedback
- **File**: Terminal.tsx

#### TerminalModal
- **Purpose**: Full-screen modal wrapper for terminal display
- **Props**: session, isOpen, callbacks (onClose, onInput, onResize, onReady)
- **Key Features**:
  - Fixed-position modal (80vw x 80vh)
  - Close on ESC key or background click
  - Renders TerminalComponent inside modal
  - Prevents click propagation to avoid closing on content click
- **File**: TerminalModal.tsx

### Dialog Components

#### NewSessionDialog
- **Purpose**: Modal for creating new sessions or attaching to existing ones
- **Props**: isOpen, onClose, onCreate, onAttach callbacks, defaults for directory/host/workspace, workspaces array
- **Key Features**:
  - Toggle between "Create New" and "Attach Existing" modes
  - Fetches hosts from /api/hosts on open
  - In attach mode: fetches available sessions for selected host
  - Shows connection errors when host unreachable
  - Workspace selection dropdown
  - Create mode: Working directory (required) + optional session name
  - Attach mode: Session name selection from available list
  - Form validation and loading states
- **State**: mode, workingDirectory, sessionName, selectedHostId, selectedWorkspaceId, selectedSessionName, hosts, availableSessions, error, loading, hostConnectionError
- **API Calls**: 
  - GET /api/hosts
  - GET /api/sessions/available?hostId=
  - POST onCreate/onAttach
- **File**: NewSessionDialog.tsx

#### ConfirmDialog
- **Purpose**: Generic confirmation modal for destructive actions
- **Props**: isOpen, title, message, confirmText, cancelText, onConfirm, onCancel, danger flag
- **Key Features**:
  - Red styling for dangerous actions (danger=true)
  - Blue styling for regular confirmations
  - Modal backdrop close support
- **File**: ConfirmDialog.tsx

#### AddHostDialog
- **Purpose**: Form modal for adding new SSH hosts
- **Props**: isOpen, onClose, onSuccess callbacks
- **Key Features**:
  - Host ID (unique identifier, required)
  - Display name, hostname, port, username (required)
  - Password (optional, toggle show/hide)
  - Private key path (optional)
  - SSH Agent toggle
  - Passphrase environment variable
  - Jump host (bastion) configuration (optional)
  - Test Connection button calls POST /api/hosts/test
  - Form submission calls POST /api/hosts
  - Validation prevents submission with missing required fields
- **State**: formData (with nested jumpHost), loading, error, testResult, testing, password visibility toggles
- **File**: AddHostDialog.tsx

#### EditHostDialog
- **Purpose**: Form modal for editing existing SSH host configurations
- **Props**: isOpen, host (SSHHost), onClose, onSuccess callbacks
- **Key Features**:
  - Same form fields as AddHostDialog
  - Host ID disabled (cannot be changed)
  - Populates form with current host values on open
  - Test Connection button
  - Form submission calls PUT /api/hosts/{id}
  - Similar validation and error handling to AddHostDialog
- **State**: formData (populated from host prop), loading, error, testResult, testing, password visibility toggles
- **File**: EditHostDialog.tsx

### Session Components

#### SessionTile
- **Purpose**: Individual session card displaying status, name, host, and last activity preview
- **Props**: session (Session), isSelected, onSelect, callbacks (onViewTerminal, onToggleFavorite, onCloseSession, onTogglePreviewCollapse), isFavorite, isPreviewCollapsed, children
- **Key Features**:
  - Draggable (except terminated sessions)
  - Status indicator dot (green=active, yellow=idle, red=disconnected, gray=other)
  - Name and host display
  - Favorite star button (toggle)
  - Preview collapse toggle button
  - Last command/input preview (Claude vs shell session logic differs)
  - Terminal button (if onViewTerminal provided and not terminated)
  - Close button (X) opens close options dialog
  - Close options dialog:
    - "Hide from workspace" - calls hideSession API, keeps session running
    - "Terminate session" - calls onCloseSession, kills tmux session
    - Cancel option
  - Preview section (expandable) renders children (terminal component)
  - "Ended" badge for terminated sessions
  - Border and ring styling changes based on selection state
  - Drag start sets dataTransfer data to session ID
- **State**: showCloseOptions, isClosing, isHiding
- **Dependencies**: hideSession service function
- **File**: SessionTile.tsx

### Feature Components

#### HostManagement
- **Purpose**: Modal panel for managing SSH host configurations
- **Props**: isOpen, onClose
- **Key Features**:
  - Header with "Add Host" button and close button
  - Loads hosts from GET /api/hosts on open
  - Displays local host (type='local') without test/edit/delete buttons
  - SSH hosts show:
    - Name, hostname:port, connection status indicator
    - Test button (calls POST /api/hosts/test)
    - Edit button (opens EditHostDialog)
    - Delete button (opens ConfirmDialog)
  - Test result display (success/failure message)
  - Delete confirmation dialog
  - Error handling and loading states
- **State**: hosts, loading, error, showAddDialog, editingHost, deletingHost, testingHostId, testResults
- **Dependencies**: AddHostDialog, EditHostDialog, ConfirmDialog
- **File**: HostManagement.tsx

#### BacklogPanel
- **Purpose**: Feature request/bug tracking panel with create/filter/export functionality
- **Props**: isOpen, onClose
- **Key Features**:
  - Header with stats (bug count, feature count)
  - Add button opens form for new items
  - Export button copies backlog as markdown to clipboard
  - Filter buttons: Pending, All, Done
  - Add form with type selector (bug/feature/improvement), priority (low/medium/high), title, description
  - Items list with:
    - Checkbox toggle for status (done/pending)
    - Type icon and priority badge
    - Title and optional description
    - Delete button
    - Strike-through for completed items
  - Empty state messages
  - Loading state
  - Keyboard hint (Ctrl+B for quick add)
- **State**: items, stats, isLoading, showAddForm, filter, form fields (newType, newTitle, newDescription, newPriority)
- **API Calls**:
  - GET getBacklogItems(filter)
  - GET getBacklogStats()
  - POST createBacklogItem
  - PUT updateBacklogItem (status)
  - DELETE deleteBacklogItem
  - GET exportBacklogMarkdown
- **File**: BacklogPanel.tsx

#### BacklogButton
- **Purpose**: Button in header that opens BacklogPanel (not included in detailed read, see file for implementation)
- **File**: BacklogButton.tsx

#### TodoList
- **Purpose**: Todo list component (not included in detailed read, see file for implementation)
- **File**: TodoList.tsx

#### Login
- **Purpose**: Authentication login form (not included in detailed read, see file for implementation)
- **File**: Login.tsx

### Control & Header Components

#### SessionControls
- **Purpose**: Header control buttons for global session management
- **Props**: onNewWorkspace, onManageHosts, onRefresh callbacks
- **Key Features**:
  - "+ New Workspace" button (blue)
  - "Manage Hosts" button (gray)
  - "Refresh" button (gray)
- **File**: SessionControls.tsx

#### SessionHeader
- **Purpose**: Header bar for session display (not included in detailed read, see file for implementation)
- **File**: SessionHeader.tsx

#### ProjectHeader
- **Purpose**: Header for project/workspace context (not included in detailed read, see file for implementation)
- **File**: ProjectHeader.tsx

#### ProjectGroup
- **Purpose**: Project grouping component (not included in detailed read, see file for implementation)
- **File**: ProjectGroup.tsx

#### WorkspaceInfoButton
- **Purpose**: Tooltip/popover button showing workspace metadata and statistics
- **Props**: workspace (with id, name, description, createdAt, updatedAt), sessionCount, activeSessionCount, todoCount, completedTodoCount, hosts array
- **Key Features**:
  - Tooltip/info icon that appears on hover
  - Shows workspace details, session statistics, todo progress, host information
- **File**: WorkspaceInfoButton.tsx

## Type Dependencies

### Session Type
```typescript
interface Session {
  id: string;
  name: string;
  host: { displayName: string; };
  status: 'active' | 'idle' | 'disconnected' | 'terminated';
  isClaudeSession: boolean;
  userLastInput?: string;
  conversationSummary?: string;
  lastOutput?: string;
  process: { currentCommand?: string; };
  lastActivityAt: string; // ISO date
  createdAt?: string;
  updatedAt?: string;
  sessionName?: string;
  sessionId?: string;
}
```

### Workspace Type
```typescript
interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface WorkspaceWithSessions extends Workspace {
  sessions: Session[];
  isCollapsed: boolean;
  hidden?: boolean;
}
```

### Host Type
```typescript
interface Host {
  id: string;
  name: string;
  type: 'local' | 'ssh';
  hostname?: string;
  connected?: boolean;
}

interface SSHHost extends Host {
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  useAgent?: boolean;
  passphraseEnvVar?: string;
  jumpHost?: {
    hostname: string;
    port: number;
    username: string;
    privateKeyPath?: string;
    password?: string;
  };
}
```

### Backlog Type
```typescript
interface BacklogItem {
  id: string;
  type: 'bug' | 'feature' | 'improvement';
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'done';
  createdAt?: string;
  updatedAt?: string;
}

interface BacklogStats {
  bugs: number;
  features: number;
}
```

## Styling Patterns

All components use Tailwind CSS with the following color scheme:

- **Background**: gray-900 (dark), gray-800 (panels), gray-700 (inputs)
- **Text**: white (primary), gray-300 (secondary), gray-400 (tertiary), gray-500 (disabled)
- **Accent**: blue-600 (primary action), red-600 (danger), green-400 (success)
- **Borders**: gray-700 (default), gray-600 (hover), blue-500 (focus/selected)
- **Status**: green-500 (active), yellow-500 (idle), red-500 (disconnected)

## Key Patterns & Conventions

### Event Handling
- Stop propagation with `e.stopPropagation()` to prevent unintended parent handlers
- Form submission via `handleSubmit` with prevent default
- Keyboard shortcuts: ESC for close, Enter for confirm

### State Management
- Use `useState` for local component state
- Use callbacks passed via props for parent coordination
- Loading and error states managed per component
- Form data often uses single object state with nested updates

### Async Operations
- Use try/catch in async functions
- Set loading state before async operation, reset in finally
- Display error messages to user with error className styling
- Show test results inline for connection testing

### Accessibility
- Use `title` attributes for button tooltips
- Proper form labels associated with inputs
- Close buttons with aria-label
- Keyboard shortcuts (ESC, Enter)

### Drag & Drop
- Set dataTransfer.effectAllowed = 'move'
- Set dataTransfer.data('text/plain', sessionId)
- Prevent default on dragover/drop
- Visual feedback with isDragOver styling

### Optional Features
- Callbacks may not be provided (check before calling)
- Some features guarded by `if (!isOpen) return null`
- Fallback behaviors for missing handlers

## Component Composition

The component hierarchy flows:

```
App
├── SessionControls (header buttons)
├── WorkspaceGrid
│   └── WorkspaceGroup (repeating)
│       └── SessionGrid
│           └── SessionTile (repeating)
│               └── Terminal (preview, when expanded)
├── TerminalModal
│   └── Terminal (full-screen)
├── NewSessionDialog
├── NewWorkspaceDialog
├── HostManagement
│   ├── AddHostDialog
│   └── EditHostDialog
├── ConfirmDialog (for deletions)
└── BacklogPanel
    └── AddForm
```

## Integration Notes

- All API calls made from components use `/api/*` endpoints
- Session service functions (hideSession) imported from services
- Backlog service provides CRUD operations
- Host management relies on /api/hosts endpoints
- Terminal integration via useTerminal hook
