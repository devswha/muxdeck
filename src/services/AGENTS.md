<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# services

Business logic layer containing 10 core singleton services that manage sessions, SSH connections, terminal I/O, storage, authentication, and host configuration. All services follow the singleton pattern and are exported as named module instances for use throughout the application.

## Purpose

Services encapsulate domain-specific business logic:
- **Session Management** - Create, discover, attach, and kill tmux sessions locally and remotely
- **SSH Connectivity** - Establish and manage SSH connections with jump host support, password auth, and native SSH fallback
- **Terminal Bridging** - Bridge WebSocket clients to local ptys or remote SSH shells for real-time I/O
- **Persistent Storage** - Manage workspaces, todos, session-workspace associations, and hidden sessions
- **Authentication** - JWT token generation and verification with bcrypt password hashing
- **Configuration** - Load, validate, and manage SSH host configurations
- **Data Migration** - Handle schema migrations and initialization of default data

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Routes Layer                          │
│              (api/sessions.ts, api/workspaces.ts, ...)         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │   Session    │  │   Terminal   │  │     SSH      │
   │  Management  │  │   Bridging   │  │  Connection  │
   │   Services   │  │   Services   │  │   Services   │
   └───────┬──────┘  └───────┬──────┘  └───────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │   Storage    │  │   Auth &     │  │ Migration &  │
   │   Services   │  │   Config     │  │   Utilities  │
   │              │  │   Services   │  │              │
   └──────────────┘  └──────────────┘  └──────────────┘
         │                   │                   │
         └─────────────────┬─┴─────────────────┬─┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
    File System                        SSH/Tmux/PTY
  (~/.session-manager/)               (System Commands)
```

## Service Catalog

### Core Session Management Services

#### 1. SessionManager
**Location**: `SessionManager.ts`

Creates, attaches, and terminates tmux sessions on local and remote hosts. Works in tandem with SessionDiscoveryService to track managed sessions.

**Key Methods**:
- `createSession(request)` - Spawns new tmux session with claude CLI locally or remotely
- `attachSession(request)` - Registers existing tmux session as managed
- `killSession(sessionId)` - Terminates tmux session and removes from managed sessions
- `killPane(sessionId)` - Kills individual pane within session

**Responsibilities**:
- Validate working directory exists (local or remote)
- Build claude command with arguments
- Execute tmux commands via local exec or SSH
- Refresh discovery after session creation
- Manage workspace associations
- Add/remove sessions from managed tracking

**Dependencies**:
- `SessionDiscoveryService` - Refresh and track sessions
- `SSHConnectionManager` - Execute remote tmux commands

**Error Handling**:
- Validates directories before creating sessions
- Distinguishes SSH errors (timeout, auth) from directory not found
- Throws descriptive errors for tmux command failures

**Example**:
```typescript
const session = await sessionManager.createSession({
  workingDirectory: '/home/user/project',
  hostId: 'local',
  sessionName: 'dev-session',
  claudeArgs: ['--no-confirm'],
  workspaceId: 'workspace-123'
});
```

#### 2. SessionDiscoveryService
**Location**: `SessionDiscoveryService.ts`

Discovers all tmux sessions on local and remote hosts, captures terminal output, status bars, and user input for session previews. Manages session-workspace associations and hidden session state.

**Key Methods**:
- `refresh()` - Discover all sessions (local + remote in parallel)
- `discoverLocalSessions()` - List local tmux sessions with pane details
- `discoverRemoteSessions(host)` - List remote tmux sessions via SSH
- `getSessions(includeHidden)` - Get non-hidden managed sessions
- `getManagedSessions()` - Get user-managed sessions only
- `setSessionWorkspace(sessionId, workspaceId)` - Associate session to workspace
- `addManagedSession(sessionId, workspaceId)` - Register as managed
- `hideSession(sessionId)` - Mark session hidden (not deleted)
- `unhideSession(sessionId)` - Restore hidden session visibility
- `startPolling(intervalMs)` - Begin automatic session refresh
- `onSessionsChange(listener)` - Subscribe to session changes

**State Management**:
- In-memory: `sessions` Map with current session state
- Persisted: `session-workspaces.json` (sessionId → workspaceId mappings)
- Persisted: `hidden-sessions.json` (Set of hidden session IDs)
- Listeners: Set of callbacks notified on session changes

**Output Capture** (for previews):
- **lastOutput**: Last non-empty line from pane (100 char limit, ANSI stripped)
- **statusBar**: tmux `status-right` content (150 char limit, ANSI stripped)
- **conversationSummary**: Most recent summary from `.claude/projects/{name}/sessions-index.json` (100 char)
- **userLastInput**: Pattern-matched user prompts from last 50 lines (e.g., `> input`, `❯ input`)

**Remote Session Optimization**:
- Skips output/status capture for remote to avoid SSH delays
- Uses composite format strings with delimiters to parse response efficiently

**Dependencies**:
- `SSHConnectionManager` - Execute tmux commands on remote hosts
- `config/hosts.ts` - List configured remote hosts
- File system (fs) - Persist session-workspace mappings and hidden state

**Example**:
```typescript
// Start polling for session changes
sessionDiscoveryService.startPolling(2000);

// Subscribe to changes
const unsubscribe = sessionDiscoveryService.onSessionsChange((sessions) => {
  console.log('Sessions updated:', sessions);
});

// Associate session to workspace
sessionDiscoveryService.setSessionWorkspace('local:$0:0', 'workspace-123');

// Hide a session from view
sessionDiscoveryService.hideSession('local:$1:2');
```

### SSH & Remote Connectivity Services

#### 3. SSHConnectionManager
**Location**: `SSHConnectionManager.ts`

Manages SSH connections with support for password authentication, private keys, jump hosts (bastion), ssh-agent, and native SSH fallback. Implements exponential backoff reconnection and connection state tracking.

**Key Methods**:
- `connect(hostId)` - Establish SSH connection (cached if already connected)
- `exec(hostId, command)` - Execute command and return stdout
- `execNative(hostId, command)` - Native SSH exec (for password auth with jump hosts)
- `shell(hostId)` - Get SSH shell channel for interactive use
- `shellNative(hostId)` - Native SSH shell via pty (for interactive terminal)
- `disconnect(hostId)` - Close connection
- `disconnectAll()` - Close all connections
- `isConnected(hostId)` - Check connection status
- `getConnectionStatus()` - Get status of all connections
- `testConnectionDirect(config)` - Test connection without saving to disk
- `testConnectionNative(config)` - Test using native SSH

**Authentication Strategy**:
1. Try private key (if path provided)
2. Try password (direct or from env var)
3. Try ssh-agent (if `useAgent: true`)
4. For password auth with jump hosts, fallback to native SSH

**Jump Host Support**:
- **ssh2 method (default)**: Uses `forwardOut()` to create tunnel through jump host
- **Native SSH method**: Uses `ssh -J` flag for better password auth support
- Auto-fallback: If native SSH fails, falls back to ssh2 forwardOut

**Reconnection**:
- Exponential backoff: 5s, 10s, 20s, ... 60s max
- Max 10 attempts per connection
- Auto-scheduled on disconnect
- Notifies listeners on success/failure

**Connection Caching**:
- Maintains Map of active connections per hostId
- Returns cached client if already connected
- One connection per host ID (multiplexing not supported)

**Password Authentication Handling**:
- Detects password prompts via pty with 500ms debounce
- Supports dual password auth (jump host + target host)
- Strips ANSI codes and password prompts from output

**Dependencies**:
- `ssh2` library - SSH client protocol
- `node-pty` - PTY for native SSH and password interaction
- `config/hosts.ts` - Host configurations
- File system - Read private keys

**Error Handling**:
- Connection timeouts (10s default, 30s for jump hosts)
- Authentication failures (invalid key, wrong password)
- Network errors (host unreachable)
- Jump host specific errors (intermediate failure)

**Example**:
```typescript
// Connect to host
const client = await sshConnectionManager.connect('prod-server');

// Execute command
const output = await sshConnectionManager.exec('prod-server', 'ls -la');

// Test connection
const result = await sshConnectionManager.testConnectionDirect(hostConfig);
if (result.success) {
  console.log('Connected!');
} else {
  console.error('Failed:', result.error);
}

// Listen to connection changes
const unsubscribe = sshConnectionManager.onConnectionChange((hostId, connected, error) => {
  console.log(`${hostId}: ${connected ? 'connected' : 'disconnected'}`);
});
```

### Terminal I/O Services

#### 4. TerminalBridgeManager
**Location**: `TerminalBridge.ts`

Bridges WebSocket clients to terminal sessions (local pty or remote SSH shell). Manages multiple concurrent bridges, handles I/O streaming, terminal resizing, and graceful disconnection with automatic cleanup.

**Key Methods**:
- `subscribe(config, clientId)` - Create/reuse bridge for client
- `unsubscribe(sessionId, clientId)` - Remove client from bridge
- `sendInput(sessionId, data)` - Write input to terminal
- `resize(sessionId, cols, rows)` - Resize terminal dimensions
- `getBuffer(sessionId)` - Get output buffer (last 1000 lines)
- `closeBridge(sessionId)` - Force close bridge
- `closeAll()` - Close all bridges
- `getBridgeInfoAll()` - Get status of all bridges

**Bridge States**:
- `initializing` - Bridge being created, not yet connected
- `connected` - Active and streaming output
- `paused` - No subscribers (waiting for grace period before close)
- `error` - Connection failed
- `closed` - Terminated and removed

**Lifecycle**:
1. First client subscribes → Create bridge, attach to tmux/SSH
2. Client receives output in real-time
3. Last client unsubscribes → Pause bridge (30s grace period)
4. No resubscribe within grace period → Close bridge
5. Early resubscribe → Resume immediately (skip close)

**Local vs Remote**:
- **Local**: Uses `tmux attach-session` via pty process
- **Remote**: Uses SSH channel + `tmux attach-session` command
- **Jump Host**: Falls back to native SSH shell for better compatibility

**Output Buffering**:
- Maintains rolling buffer (max 1000 lines)
- Prevents memory growth on long-running sessions
- Buffer available via `getBuffer(sessionId)`

**Terminal Resizing**:
- Client sends resize message with new dimensions
- Manager updates bridge dimensions
- Updates pty window (local) or SSH channel window (remote)

**Dependencies**:
- `SSHConnectionManager` - Create remote SSH shells
- `SessionDiscoveryService` - Check session host type
- `node-pty` - Spawn local pty for tmux attach
- `config/hosts.ts` - Get host config for jump host detection

**Example**:
```typescript
// Client subscribes to session terminal
const bridge = await terminalBridgeManager.subscribe({
  sessionId: 'local:$0:0',
  cols: 80,
  rows: 24,
  tmuxTarget: 'session-name:0.0'
}, clientId);

// Send input
terminalBridgeManager.sendInput('local:$0:0', 'ls -la\n');

// Resize
terminalBridgeManager.resize('local:$0:0', 120, 40);

// Client unsubscribes (pauses bridge, close after grace period)
terminalBridgeManager.unsubscribe('local:$0:0', clientId);
```

### Storage Services

#### 5. WorkspaceStorage
**Location**: `WorkspaceStorage.ts`

Persistent storage for workspaces with CRUD operations. Uses atomic file writes to prevent corruption.

**Key Methods**:
- `getAll()` - List all workspaces
- `getById(id)` - Get workspace by ID
- `create(request)` - Create new workspace
- `update(id, request)` - Update existing workspace
- `delete(id)` - Delete workspace

**Storage**:
- File: `~/.session-manager/workspaces.json`
- Format: `{ version: 1, workspaces: [...] }`
- Atomic writes: Write to `.tmp`, then rename

**Data Structure**:
```typescript
interface Workspace {
  id: string;                    // UUID
  name: string;
  description?: string;
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

**Dependencies**:
- File system (fs/promises) - Async file I/O
- crypto - UUID generation

**Example**:
```typescript
const workspaceStorage = new WorkspaceStorage();

const workspace = await workspaceStorage.create({
  name: 'My Project',
  description: 'Development workspace'
});

const updated = await workspaceStorage.update(workspace.id, {
  name: 'Updated Name'
});

await workspaceStorage.delete(workspace.id);
```

#### 6. TodoStorage
**Location**: `TodoStorage.ts`

Persistent storage for todo items scoped to workspaces. Supports filtering by workspace and status.

**Key Methods**:
- `getByWorkspace(workspaceId)` - Get all todos for workspace
- `getById(id)` - Get todo by ID
- `create(workspaceId, request)` - Create new todo
- `update(workspaceId, todoId, request)` - Update todo
- `delete(workspaceId, todoId)` - Delete todo
- `deleteByWorkspaceId(workspaceId)` - Delete all todos for workspace (cascade)

**Storage**:
- File: `~/.session-manager/todos.json`
- Format: `{ version: 1, todos: [...] }`
- Atomic writes: Write to `.tmp`, then rename

**Data Structure**:
```typescript
interface Todo {
  id: string;                    // UUID
  workspaceId: string;           // Parent workspace
  text: string;
  completed: boolean;
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

**Dependencies**:
- File system (fs/promises) - Async file I/O
- crypto - UUID generation

**Example**:
```typescript
const todoStorage = new TodoStorage();

const todo = await todoStorage.create('workspace-123', {
  text: 'Implement feature X'
});

await todoStorage.update('workspace-123', todo.id, {
  completed: true
});

const workspaceTodos = await todoStorage.getByWorkspace('workspace-123');
```

#### 7. BacklogService
**Location**: `BacklogService.ts`

In-memory and file-backed storage for feature backlog items with priority and status tracking. Supports Markdown export for documentation.

**Key Methods**:
- `getAll(status?)` - Get all items, optionally filtered by status
- `getPending()` - Get incomplete items
- `getById(id)` - Get item by ID
- `create(request)` - Create new backlog item
- `update(id, request)` - Update item
- `delete(id)` - Delete item
- `getStats()` - Get statistics (total, pending, bugs, features)
- `exportMarkdown()` - Export pending items as Markdown

**Storage**:
- File: `~/.session-manager/backlog.json`
- Kept in memory for fast access
- Automatic save after mutations
- Atomic writes: Write to `.tmp`, then rename

**Data Structure**:
```typescript
interface BacklogItem {
  id: string;                    // "bl_" + timestamp + random
  type: 'bug' | 'feature' | 'improvement';
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'done';
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

**Dependencies**:
- File system (fs) - Sync I/O for simple load/save
- Path utilities - Storage path resolution

**Example**:
```typescript
const backlogService = new BacklogService();

const item = backlogService.create({
  type: 'feature',
  title: 'Add dark mode',
  description: 'Implement dark theme',
  priority: 'medium'
});

backlogService.update(item.id, {
  status: 'in_progress'
});

const stats = backlogService.getStats();
console.log(`${stats.pending} items pending`);

const markdown = backlogService.exportMarkdown();
console.log(markdown);
```

### Authentication & Configuration Services

#### 8. AuthService
**Location**: `AuthService.ts`

JWT token generation and verification with optional bcrypt password validation. Supports optional authentication (disabled if no password hash configured).

**Key Methods**:
- `isEnabled()` - Check if authentication is required
- `validateCredentials(username, password)` - Validate login credentials
- `generateToken(username)` - Create JWT token
- `verifyToken(token)` - Validate and decode JWT
- `hashPassword(password)` - Generate bcrypt hash (async)

**Configuration**:
- Secret: `AUTH_SECRET` env var (default: insecure dev value)
- Token Expiry: `AUTH_TOKEN_EXPIRY` env var (default: 86400 seconds = 24 hours)
- Username: `AUTH_USERNAME` env var (default: "admin")
- Password Hash: `AUTH_PASSWORD_HASH` env var (empty = auth disabled)

**JWT Payload**:
```typescript
interface JWTPayload {
  sub: string;       // Subject (username)
  iat: number;       // Issued at (epoch seconds)
  exp: number;       // Expiration (epoch seconds)
}
```

**Auth Disabled**:
- If `AUTH_PASSWORD_HASH` is empty, authentication is disabled
- `validateCredentials()` returns true without checking
- Useful for development or internal networks

**Dependencies**:
- `jsonwebtoken` - JWT signing/verification
- `bcrypt` - Password hashing and comparison

**Example**:
```typescript
const authService = new AuthService();

// Check if auth is required
if (authService.isEnabled()) {
  // Validate login
  const valid = await authService.validateCredentials('admin', 'password');
  if (valid) {
    const { token, expiresAt } = authService.generateToken('admin');
    console.log(`Token: ${token}, expires: ${expiresAt}`);
  }
}

// Verify token in request
try {
  const payload = authService.verifyToken(token);
  console.log(`User: ${payload.sub}`);
} catch (err) {
  console.error('Invalid token');
}

// Generate password hash for config
const hash = await authService.hashPassword('my-password');
console.log(`AUTH_PASSWORD_HASH=${hash}`);
```

#### 9. HostConfigService
**Location**: `HostConfigService.ts`

Manages SSH host configurations with validation, persistence, and connection testing. Validates host configurations before saving and disconnects existing connections after updates.

**Key Methods**:
- `addHost(config)` - Add new host configuration
- `updateHost(id, updates)` - Update existing host
- `deleteHost(id)` - Delete host and disconnect
- `testConnection(config)` - Test connection to host (without saving)

**Validation**:
- Unique host IDs
- Required fields: id, name, hostname, username
- Port range: 1-65535
- Sets default port 22 if not specified

**File Location**:
- `config/hosts.json` (in project root)
- Formatted JSON with indentation (2 spaces)
- Directory created if missing

**Dependencies**:
- `SSHConnectionManager` - Test connections, disconnect existing
- `config/hosts.ts` - Load/parse host configurations
- File system - Read/write config files

**Example**:
```typescript
const hostConfigService = new HostConfigService();

// Add host
await hostConfigService.addHost({
  id: 'prod-server',
  name: 'Production Server',
  hostname: 'prod.example.com',
  port: 22,
  username: 'ubuntu',
  privateKeyPath: '/home/user/.ssh/id_rsa'
});

// Test connection
const result = await hostConfigService.testConnection({
  id: 'prod-server',
  name: 'Production Server',
  hostname: 'prod.example.com',
  port: 22,
  username: 'ubuntu',
  privateKeyPath: '/home/user/.ssh/id_rsa'
});

if (result.success) {
  console.log('Connected!');
} else {
  console.error('Failed:', result.error);
}

// Update host
await hostConfigService.updateHost('prod-server', {
  port: 2222
});

// Delete host
await hostConfigService.deleteHost('prod-server');
```

### Utility Services

#### 10. MigrationService
**Location**: `MigrationService.ts`

Handles data schema migrations and initialization. Currently manages creation of default workspace on first run.

**Key Methods**:
- `runMigrations()` - Execute all pending migrations

**Migrations**:
- `v1_default_workspace` - Creates "Default" workspace if none exist

**Storage**:
- File: `~/.session-manager/migration.json`
- Tracks completed migrations as boolean flags

**Dependencies**:
- `WorkspaceStorage` - Create default workspace
- File system - Track migration state

**Example**:
```typescript
const migrationService = new MigrationService();
await migrationService.runMigrations();  // Run on app startup
```

## Common Patterns & Best Practices

### Singleton Pattern

All services are singletons exported as named constants:

```typescript
// Definition in service file
export class SessionManager { ... }
export const sessionManager = new SessionManager();

// Usage elsewhere
import { sessionManager } from '../services/SessionManager.js';
sessionManager.createSession(...);
```

### Session Identification

Sessions have composite IDs: `{hostId}:{tmuxSessionId}:{paneId}`

Examples:
- `local:$0:0` - Local host, session $0, pane 0
- `prod-server:$1:1` - Remote host "prod-server", session $1, pane 1

**Why composite IDs?**
- Global uniqueness across hosts
- Enables routing to correct host for SSH commands
- Matches tmux's own session/pane hierarchy

### Managed vs Discovered Sessions

**Discovered**: All tmux sessions found during scan (stored in-memory only)
- Found via `tmux list-sessions`
- Includes sessions not yet managed by the app
- Cleaned up after discovery refresh

**Managed**: Sessions explicitly tracked by user (persisted)
- User creates or attaches session → becomes managed
- Stored in `sessionWorkspaceMap`
- Associated to workspace
- Persist even after refresh

**Hidden**: Managed sessions hidden from view (not deleted)
- User clicks "hide" button → session hidden
- Stored in `hiddenSessions` Set
- Can be unhidden by "attach" action
- Not deleted, just filtered out in queries

### Atomic File Writes

All file-based storage uses atomic writes to prevent corruption:

```typescript
// Pattern used throughout storage services
const tempPath = `${filePath}.tmp`;
fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
fs.renameSync(tempPath, filePath);  // Atomic rename (either succeeds fully or not at all)
```

### Error Handling

Services distinguish between different error types:

```typescript
// SessionManager example
try {
  await exec(`test -d "${directory}"`);
} catch {
  // Could be: SSH timeout, auth failure, or directory not found
  // Distinguish based on error message
  if (errMsg.includes('Timed out') || errMsg.includes('authentication')) {
    throw new Error(`SSH connection failed: ${errMsg}`);
  }
  throw new Error(`Directory does not exist: ${directory}`);
}
```

### Listener Pattern for Real-time Updates

Services that change frequently use observer pattern:

```typescript
// SessionDiscoveryService
const unsubscribe = sessionDiscoveryService.onSessionsChange((sessions) => {
  console.log('Sessions updated:', sessions);
});

// Connection status changes
const disconnect = sshConnectionManager.onConnectionChange((hostId, connected) => {
  console.log(`${hostId}: ${connected ? 'connected' : 'disconnected'}`);
});
```

### Configuration Loading

Services load configuration from environment variables:

```typescript
// AuthService example
const config: AuthConfig = {
  secret: process.env.AUTH_SECRET || 'default-value',
  tokenExpiry: parseInt(process.env.AUTH_TOKEN_EXPIRY || '86400', 10),
  username: process.env.AUTH_USERNAME || 'admin',
  passwordHash: process.env.AUTH_PASSWORD_HASH || '',
};
```

## Service Dependencies Graph

```
SessionManager
├─ SessionDiscoveryService
├─ SSHConnectionManager
└─ (terminates tmux sessions locally or remotely)

SessionDiscoveryService
├─ SSHConnectionManager (for remote discovery)
├─ config/hosts.ts (list available hosts)
└─ File system (persist session-workspace mappings)

SSHConnectionManager
├─ config/hosts.ts (load host configs)
├─ ssh2 library (SSH protocol)
└─ node-pty (native SSH + password auth)

TerminalBridgeManager
├─ SSHConnectionManager (create remote shells)
├─ SessionDiscoveryService (check session host type)
├─ node-pty (local pty attachment)
└─ File system (none, all in-memory)

WorkspaceStorage
├─ File system (fs/promises)
└─ crypto (UUID generation)

TodoStorage
├─ File system (fs/promises)
└─ crypto (UUID generation)

BacklogService
├─ File system (fs, sync)
└─ (ID generation via timestamp + random)

AuthService
├─ jsonwebtoken library (JWT operations)
└─ bcrypt library (password hashing)

HostConfigService
├─ SSHConnectionManager (test connections)
├─ config/hosts.ts (load configurations)
└─ File system (read/write config file)

MigrationService
└─ WorkspaceStorage (create default workspace)
```

## Initialization Flow

Typical startup sequence:

```typescript
// In server/app.ts or index.ts

import { migrationService } from './services/MigrationService.js';
import { sessionDiscoveryService } from './services/SessionDiscoveryService.js';

// 1. Run migrations (creates default workspace if needed)
await migrationService.runMigrations();

// 2. Start session polling
sessionDiscoveryService.startPolling(2000);  // Refresh every 2 seconds

// 3. Set up WebSocket handlers
webSocketServer.setOutputHandler((sessionId, data) => {
  // Stream output to clients
});
webSocketServer.setStateChangeHandler((sessionId, state, error) => {
  // Notify clients of state changes
});

// 4. Start Fastify server
await app.listen({ port: 3000, host: '0.0.0.0' });
```

## Testing Checklist

When adding or modifying services:

- [ ] Verify singleton instance is exported
- [ ] Check error messages are descriptive
- [ ] Confirm atomic file writes (use `.tmp` + rename pattern)
- [ ] Test with local sessions
- [ ] Test with remote SSH sessions
- [ ] Test with jump host if implemented
- [ ] Verify persistence (data survives restart)
- [ ] Check connection caching (reuse, not duplicate)
- [ ] Validate listener cleanup (no memory leaks)
- [ ] Test error cases (network failures, invalid input)
- [ ] Confirm timeouts prevent hangs (10-30s max)

## Common Issues & Solutions

| Issue | Service | Cause | Solution |
|-------|---------|-------|----------|
| Sessions not discovered | SessionDiscoveryService | tmux not installed or stopped | Verify tmux: `tmux list-sessions` |
| SSH timeout | SSHConnectionManager | Network unreachable, slow connection | Increase timeout in connect config |
| Jump host fails | SSHConnectionManager | Intermediate host unreachable | Test jump host directly: `ssh jump-host` |
| Password auth not working | SSHConnectionManager | Wrong env var, missing prompt detection | Check SSH prompts, verify password format |
| Bridge closes immediately | TerminalBridgeManager | All clients unsubscribed | Client should re-subscribe within 30s grace period |
| Workspace data lost | WorkspaceStorage | File corruption or race condition | Check JSON integrity: `cat ~/.session-manager/workspaces.json` |
| Auth disabled unexpectedly | AuthService | PASSWORD_HASH empty or missing | Set `AUTH_PASSWORD_HASH` env var |
| Cannot add host | HostConfigService | Invalid config or ID already exists | Validate config fields, check for duplicate IDs |

## MANUAL:

This documentation was generated from codebase analysis. To keep it accurate:
1. Update service descriptions if implementation changes significantly
2. Add new services to the catalog as they're created
3. Update the dependencies graph if services are added/removed
4. Verify error handling patterns match current code
5. Update configuration examples if environment variables change
6. Review common issues as new problems are discovered
