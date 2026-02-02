<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# src

Backend source directory containing the HTTP/WebSocket server, REST API routes, business logic services, and type definitions.

## Purpose

Provides a full-featured backend for managing Claude sessions across local and remote hosts via:
- **Fastify HTTP server** with REST API routes for sessions, workspaces, hosts, todos, and backlog
- **WebSocket real-time terminal** connection and control
- **Session discovery and management** for local and remote tmux sessions
- **SSH connection handling** with jump host, password auth, and native SSH support
- **Terminal bridging** between web clients and local/remote shells
- **Workspace and resource management** with persistent storage
- **Authentication** with optional JWT token-based access control

## Architecture Overview

```
┌─────────────────┐
│  Fastify App    │ (app.ts)
│  (HTTP Server)  │
└────────┬────────┘
         │
    ┌────┴─────────┬──────────────┬──────────────┬────────────┬─────────┐
    │              │              │              │            │         │
    ▼              ▼              ▼              ▼            ▼         ▼
 Sessions       Workspaces      Hosts         Todos       Backlog   Auth
 API Routes     API Routes      API Routes    API Routes   API Routes API Routes
    │              │              │              │            │         │
    └──────────────┴──────────────┴──────────────┴────────────┴─────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
    Services         Middleware        WebSocket
    (Business)       (Auth Guard)       Server

Services:
├─ SessionManager ────────────────► Creates/Attaches tmux sessions
├─ SessionDiscoveryService ───────► Discovers local & remote tmux sessions
├─ SSHConnectionManager ──────────► SSH connections with jump hosts & auth
├─ TerminalBridgeManager ────────► Terminal I/O bridging
├─ WorkspaceStorage ─────────────► Workspace persistence
├─ AuthService ──────────────────► JWT token generation/verification
├─ HostConfigService ────────────► Host configuration management
├─ MigrationService ─────────────► Database schema migrations
└─ BacklogService & TodoStorage ─► Feature backlog and todo tracking
```

## Key Files

| File | Description |
|------|-------------|
| **index.ts** | Entry point; loads config and starts server |
| **server/app.ts** | Fastify setup, route registration, error handling, server startup |
| **server/WebSocketServer.ts** | WebSocket connection management with heartbeat/ping |
| **server/MessageHandler.ts** | WebSocket message routing and terminal I/O handling |
| **api/sessions.ts** | Session discovery, creation, attachment, deletion endpoints |
| **api/workspaces.ts** | Workspace CRUD endpoints |
| **api/hosts.ts** | Host configuration and connection testing endpoints |
| **api/todos.ts** | Todo item management endpoints |
| **api/backlog.ts** | Feature backlog endpoints |
| **api/auth.ts** | JWT login endpoint |
| **services/SessionManager.ts** | Creates/attaches tmux sessions locally and remotely |
| **services/SessionDiscoveryService.ts** | Discovers tmux sessions, captures status/output, manages managed sessions |
| **services/SSHConnectionManager.ts** | SSH client management, jump hosts, password auth, native SSH exec |
| **services/TerminalBridge.ts** | Bridges terminal I/O between WebSocket clients and tmux/SSH |
| **services/WorkspaceStorage.ts** | JSON file-based workspace persistence (~/.session-manager/workspaces.json) |
| **services/AuthService.ts** | JWT token generation and verification |
| **services/HostConfigService.ts** | SSH host configuration management |
| **services/BacklogService.ts** | Feature backlog storage and retrieval |
| **services/TodoStorage.ts** | Todo item persistence |
| **services/MigrationService.ts** | Database schema migrations (creates default workspace on first run) |
| **middleware/auth.ts** | JWT token validation for protected routes |
| **config/index.ts** | Configuration loading from environment/files |
| **config/hosts.ts** | SSH host configuration parsing |
| **types/Session.ts** | Session interface, status types, tmux info, process info |
| **types/Workspace.ts** | Workspace interface and request/response types |
| **types/Terminal.ts** | Terminal bridge configuration and state types |
| **types/Protocol.ts** | WebSocket message protocol types |
| **types/Project.ts** | Project/workspace related types |
| **types/Backlog.ts** | Backlog feature request types |
| **types/Todo.ts** | Todo item types |
| **utils/tmux.ts** | tmux command parsing (list sessions, list panes, detect Claude sessions) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| **api/** | REST API route handlers (Fastify route functions) |
| **server/** | HTTP and WebSocket server setup and message handling |
| **services/** | Business logic and singleton service instances |
| **middleware/** | Request middleware (authentication, authorization) |
| **config/** | Configuration loading and host setup |
| **types/** | TypeScript type definitions and interfaces |
| **utils/** | Utility functions (tmux parsing, helpers) |

## For AI Agents

### Session Management Flow

1. **Discover Sessions** → `SessionDiscoveryService.refresh()` scans local and remote tmux sessions
2. **Create Session** → `SessionManager.createSession()` spawns tmux with claude CLI
3. **Attach Session** → `SessionManager.attachSession()` registers existing tmux session
4. **Mark Managed** → `SessionDiscoveryService.addManagedSession()` tracks user-managed sessions
5. **Track Workspace** → `SessionDiscoveryService.setSessionWorkspace()` associates session to workspace
6. **Hide Sessions** → `SessionDiscoveryService.hideSession()` marks session hidden (not deleted)
7. **Kill Session** → `SessionManager.killSession()` terminates tmux session

### Terminal Connection Flow

1. **WebSocket Subscribe** → Client sends `subscribe` message with `sessionId`
2. **Bridge Creation** → `TerminalBridgeManager.subscribe()` creates terminal bridge
3. **Local Sessions** → Uses `tmux attach-session` via pty
4. **Remote Sessions** → Uses SSH shell (native or ssh2) + tmux attach
5. **I/O Streaming** → Bridge pipes output to WebSocket clients in real-time
6. **Unsubscribe** → Client disconnects; bridge paused then closed after grace period (30s)

### SSH Connection Flow

1. **Connect** → `SSHConnectionManager.connect()` establishes SSH session
2. **Jump Host** → If configured, connects via jump host with `forwardOut()` or native SSH `-J`
3. **Authentication** → Tries password (env var or config), private key, or ssh-agent
4. **Reconnection** → Failed connections auto-reconnect with exponential backoff (max 10 attempts)
5. **Command Exec** → `exec()` runs commands; `execNative()` uses native SSH for password auth
6. **Shells** → `shell()` for ssh2 shell; `shellNative()` for native SSH with pty

### Key Patterns

**Singleton Services**
```typescript
// Services are singletons exported as named exports
export const sessionManager = new SessionManager();
export const sessionDiscoveryService = new SessionDiscoveryService();
export const sshConnectionManager = new SSHConnectionManager();
export const terminalBridgeManager = new TerminalBridgeManager();
export const authService = new AuthService();
export const webSocketServer = new WebSocketServerManager();
```

**Session Identification**
Sessions have composite IDs: `{hostId}:{tmuxSessionId}:{paneId}`
- Example: `local:$0:0` (local host, session $0, pane 0)
- Example: `prod-server:$1:1` (remote host, session $1, pane 1)

**Managed vs Discovered Sessions**
- **Discovered**: All tmux sessions found during scan (includes hidden sessions)
- **Managed**: Sessions explicitly added by user (stored in `sessionWorkspaceMap`)
- **Hidden**: Managed sessions marked hidden without deletion (stored in `hiddenSessions`)

**File Persistence**
- Sessions ↔ workspaces: `~/.session-manager/session-workspaces.json`
- Hidden sessions: `~/.session-manager/hidden-sessions.json`
- Workspaces: `~/.session-manager/workspaces.json`
- Atomic writes with `.tmp` file + rename to prevent corruption

**Terminal Output Capture**
- **Last Output**: Single-line preview from tmux pane (100 char limit, ANSI stripped)
- **Status Bar**: tmux status-right content (150 char limit)
- **User Input**: Pattern detection from last 50 lines (e.g., `> input`, `❯ input`)
- **Conversation Summary**: Reads from `.claude/projects/{name}/sessions-index.json`

**WebSocket Protocol**
- Messages: JSON with `type` field (e.g., `subscribe`, `input`, `resize`, `output`)
- Streaming: Server sends `output` messages as terminal data arrives
- Heartbeat: 30-second ping/pong to detect dead connections

### Common Tasks

**Add a new API endpoint**
1. Create route function in `api/{resource}.ts`
2. Define request/response types in `types/{resource}.ts`
3. Register route in `server/app.ts` via `await {resource}Routes(app)`

**Discover sessions on a new host**
1. Add host config to `config/hosts.ts`
2. `SessionDiscoveryService.refresh()` auto-discovers on next poll

**Create a session**
```typescript
const session = await sessionManager.createSession({
  workingDirectory: '/path/to/project',
  hostId: 'local',
  sessionName: 'my-session',
  claudeArgs: ['--no-confirm'],
  workspaceId: 'workspace-uuid'
});
```

**Connect terminal to session**
1. Client sends WebSocket message: `{ type: 'subscribe', sessionId: '...', cols: 80, rows: 24 }`
2. Server calls `terminalBridgeManager.subscribe(config, clientId)`
3. Bridge established; output streaming begins
4. Client receives `output` messages in real-time

**Test SSH connection**
```typescript
const result = await sshConnectionManager.testConnectionDirect(hostConfig);
if (result.success) {
  console.log('Connected!');
} else {
  console.error('Error:', result.error);
}
```

## Dependencies

### Core
- **Fastify** - HTTP server framework
- **WebSocket (ws)** - WebSocket server
- **ssh2** - SSH client library (supports streams, key-based auth)
- **node-pty** - PTY and native process spawning
- **jsonwebtoken (jwt)** - JWT token generation/verification
- **bcrypt** - Password hashing

### Configuration
- **dotenv** - Environment variable loading
- **config** - Hierarchical config files (if used)

### Storage
- **fs/promises** - Async file operations
- **crypto** - UUID generation

### Utilities
- **child_process.exec** - Shell command execution (promisified)

## Configuration

### Environment Variables
```bash
# Server
SERVER_PORT=3000
SERVER_HOST=localhost

# Authentication
AUTH_ENABLED=true              # Set to true to require login
AUTH_SECRET=your-secret-key
AUTH_TOKEN_EXPIRY=86400        # Seconds (default: 24 hours)
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=<bcrypt>    # Generated via authService.hashPassword()

# Discovery
DISCOVERY_POLL_INTERVAL=2000   # ms between session refreshes

# SSH
SSH_TIMEOUT=10000              # Connection timeout
```

### Host Configuration
Hosts defined in `config/hosts.ts` or environment:
```javascript
{
  id: 'prod-server',
  name: 'Production Server',
  hostname: 'prod.example.com',
  port: 22,
  username: 'ubuntu',
  privateKeyPath: '/home/user/.ssh/id_rsa',
  password: undefined,           // Or load from env var
  passwordEnvVar: 'PROD_SSH_PASS',
  useAgent: true,                // Use SSH_AUTH_SOCK
  jumpHost: {                    // Optional
    hostname: 'bastion.example.com',
    port: 22,
    username: 'jump-user',
    privateKeyPath: '/home/user/.ssh/jump_key',
    password: undefined,
    passwordEnvVar: 'JUMP_SSH_PASS'
  }
}
```

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Session not discovered | tmux not installed or session terminated | Verify tmux running: `tmux list-sessions` |
| SSH connection timeout | Network unreachable or auth fails | Check host config, verify SSH access: `ssh user@host` |
| Jump host fails | Intermediate SSH not reachable | Test jump host directly; verify `.ssh/config` if using native SSH |
| Terminal output stops | Bridge disconnected after grace period | Client should re-subscribe before 30s timeout |
| Password auth not working | Env var not set or bcrypt hash mismatch | Verify `AUTH_PASSWORD_HASH` via `authService.hashPassword()` |
| Workspace sessions lost | File corruption or race condition | Check `~/.session-manager/session-workspaces.json` integrity |

## Testing Checklist

- [ ] List local sessions: `GET /api/sessions`
- [ ] Create new session: `POST /api/sessions` with working directory
- [ ] Attach existing session: `POST /api/sessions/attach`
- [ ] WebSocket connection: Connect to `/ws` and send `subscribe` message
- [ ] Terminal I/O: Send `input` message; receive `output` messages
- [ ] SSH hosts: `GET /api/hosts` and `POST /api/hosts/{id}/test`
- [ ] Workspaces: CRUD operations on `/api/workspaces`
- [ ] Auth: Login via `/api/auth/login`; use token in `Authorization: Bearer` header
- [ ] Session deletion: `DELETE /api/sessions/{id}` kills tmux session

## MANUAL:

This documentation was auto-generated from codebase analysis. For updates:
1. Verify file paths and descriptions match current implementation
2. Check for new services or routes added since generation
3. Update architecture diagram if structure changes
4. Review configuration examples for correctness
5. Test common tasks to ensure accuracy
