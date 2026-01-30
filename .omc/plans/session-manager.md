# Work Plan: Browser-Based Claude Code Session Manager

## Context

### Original Request
Create a browser-based service to manage Claude Code sessions across multiple tmux windows and SSH connections, with a parallel view interface for viewing and managing all sessions simultaneously.

### Environment
- **Project Location**: `/home/devswha/workspace/session-manager`
- **Current State**: Fresh project (empty directory)
- **tmux**: v3.4 available at `/usr/bin/tmux`
- **Node.js**: v24.13.0 with npm 11.6.2
- **Python**: 3.12.3
- **Claude CLI**: v2.1.23 at `/home/devswha/.local/bin/claude`

---

## Work Objectives

### Core Objective
Build a web application that discovers, displays, and manages Claude Code sessions running in tmux across local and remote SSH hosts, providing a unified browser-based interface for parallel session monitoring and interaction.

### Deliverables
1. Backend server with tmux session discovery and management
2. WebSocket-based real-time communication layer
3. Browser-based UI with parallel session grid view
4. SSH host configuration system
5. Session control API (start, stop, attach, detach)

### Definition of Done
- [ ] Can discover all Claude Code sessions in local tmux
- [ ] Can discover sessions on configured remote SSH hosts
- [ ] Browser displays live session output in parallel grid
- [ ] Can send input to any session from browser
- [ ] Can start new Claude Code sessions
- [ ] Can stop/kill sessions
- [ ] UI updates in real-time (<500ms latency)
- [ ] Works with 10+ concurrent sessions

---

## Technology Stack

### Backend: Node.js + TypeScript
**Rationale**:
- Excellent async I/O for managing multiple tmux/SSH connections
- Native WebSocket support for real-time updates
- Good tmux/process control libraries available
- Fast development with TypeScript

### Frontend: React + TypeScript
**Rationale**:
- Component-based architecture perfect for session tiles
- Excellent for real-time updates with state management
- xterm.js integration for terminal rendering
- Tailwind CSS for rapid UI development

### Real-time: WebSocket + node-pty
**Rationale**:
- WebSocket for browser-server communication
- node-pty for PTY allocation and terminal I/O
- Low latency bidirectional communication

### Key Libraries
| Component | Library | Version | Purpose |
|-----------|---------|---------|---------|
| Web server | Fastify | ^4.x | Fast, low-overhead HTTP server |
| CORS | @fastify/cors | ^9.x | Cross-origin resource sharing |
| WebSocket | ws | ^8.x | Native WebSocket server |
| Terminal | node-pty | ^1.x | PTY management |
| SSH | ssh2 | ^1.x | Remote host connections |
| Frontend | React 18 | ^18.x | UI framework |
| Terminal UI | xterm.js | ^5.x | Terminal emulation in browser |
| xterm addon | @xterm/addon-fit | ^0.10.x | Auto-resize terminal |
| xterm addon | @xterm/addon-webgl | ^0.18.x | GPU-accelerated rendering (with canvas fallback) |
| Styling | Tailwind CSS | ^3.x | Utility-first CSS |
| Build | Vite | ^5.x | Fast dev server and bundler |

---

## Type Definitions (Critical Schemas)

### Session Interface

```typescript
// src/types/Session.ts

/** Represents the connection status of a session */
export type SessionStatus =
  | 'active'      // Session is running and responsive
  | 'idle'        // Session exists but no recent activity
  | 'disconnected' // Lost connection (SSH/tmux error)
  | 'terminated'; // Session has ended

/** Host types for session location */
export type HostType = 'local' | 'remote';

/** Complete Session interface */
export interface Session {
  /** Globally unique session identifier: `{hostId}:{tmuxSessionId}` */
  id: string;

  /** Human-readable session name (from tmux session name) */
  name: string;

  /** Host information */
  host: {
    /** Host identifier: 'local' or configured host ID */
    id: string;
    /** Host type */
    type: HostType;
    /** Display name for UI */
    displayName: string;
  };

  /** tmux-specific identifiers */
  tmux: {
    /** tmux session ID (e.g., '$0') */
    sessionId: string;
    /** tmux session name */
    sessionName: string;
    /** tmux pane ID where Claude is running (e.g., '%0') */
    paneId: string;
    /** tmux window index */
    windowIndex: number;
  };

  /** Current session status */
  status: SessionStatus;

  /** Whether this session is running Claude Code */
  isClaudeSession: boolean;

  /** Process information */
  process: {
    /** PID of the pane's process */
    pid: number;
    /** Current command running in pane */
    currentCommand: string;
  };

  /** Timestamps (ISO 8601 format) */
  createdAt: string;
  lastActivityAt: string;

  /** Terminal dimensions */
  dimensions: {
    cols: number;
    rows: number;
  };
}

/** Session creation request */
export interface CreateSessionRequest {
  /** Working directory for the new session */
  workingDirectory: string;

  /** Host where to create session: 'local' or configured host ID */
  hostId: string;

  /** Optional tmux session name (auto-generated if omitted) */
  sessionName?: string;

  /** Optional arguments to pass to claude CLI */
  claudeArgs?: string[];
}

/** Session creation response */
export interface CreateSessionResponse {
  session: Session;
}
```

### Terminal Interface

```typescript
// src/types/Terminal.ts

/** Terminal bridge state */
export type BridgeState =
  | 'initializing' // Bridge is being created
  | 'connected'    // Actively streaming I/O
  | 'paused'       // Temporarily paused (no subscribers)
  | 'error'        // Error state
  | 'closed';      // Bridge has been terminated

/** Terminal bridge - manages PTY connection to a session */
export interface TerminalBridge {
  /** Unique bridge identifier (matches session ID) */
  id: string;

  /** Reference to the session this bridge connects to */
  sessionId: string;

  /** Current bridge state */
  state: BridgeState;

  /** Terminal dimensions */
  dimensions: {
    cols: number;
    rows: number;
  };

  /** Connected WebSocket client IDs (for broadcast) */
  subscriberIds: Set<string>;

  /** Last error message if state is 'error' */
  lastError?: string;

  /** Timestamp of last I/O activity */
  lastActivityAt: Date;

  /** For SSH bridges: the SSH channel reference */
  sshChannel?: object; // ssh2.ClientChannel

  /** For local bridges: the PTY instance */
  ptyProcess?: object; // node-pty.IPty
}

/** Configuration for creating a terminal bridge */
export interface BridgeConfig {
  sessionId: string;
  cols: number;
  rows: number;
  /** Whether to attach in read-only mode initially */
  readOnly?: boolean;
}
```

### PTY Bridge Concurrency Model

```typescript
/**
 * BRIDGE CONCURRENCY MODEL: Shared Per Session (Broadcast Mode)
 *
 * Design Decision: One PTY bridge per session, broadcasting to all subscribers.
 *
 * Rationale:
 * - Memory efficient: Single PTY per session regardless of viewer count
 * - Consistent view: All clients see identical terminal state
 * - Simpler state: No per-client PTY lifecycle management
 *
 * Flow:
 * 1. First client subscribes to session → Create bridge, spawn PTY
 * 2. Additional clients subscribe → Add to subscribers set, receive current buffer
 * 3. PTY output → Broadcast to ALL subscribers
 * 4. Client input → Forward to PTY (all clients share input)
 * 5. Last client unsubscribes → Pause bridge (keep PTY alive for 30s grace period)
 * 6. Grace period expires with no subscribers → Close bridge and PTY
 *
 * Input Conflict Resolution:
 * - All subscriber input is forwarded to PTY in arrival order
 * - No input locking (collaborative by design)
 * - UI should indicate when multiple users are connected
 */

export interface BridgeManager {
  /** Map of session ID to single shared bridge */
  bridges: Map<string, TerminalBridge>;

  /** Subscribe client to session (creates bridge if needed) */
  subscribe(sessionId: string, clientId: string): Promise<void>;

  /** Unsubscribe client (closes bridge if last subscriber) */
  unsubscribe(sessionId: string, clientId: string): Promise<void>;

  /** Forward input from any subscriber */
  sendInput(sessionId: string, data: string): void;

  /** Resize bridge (applied to shared PTY) */
  resize(sessionId: string, cols: number, rows: number): void;
}
```

---

## Architecture Design

```
+------------------+     WebSocket      +------------------+
|   Browser UI     | <----------------> |   Backend Server |
|  (React + xterm) |                    |  (Node + Fastify)|
+------------------+                    +------------------+
                                               |
                    +------------------+-------+-------+
                    |                  |               |
              +-----v-----+      +-----v-----+   +-----v-----+
              | Local     |      | SSH Host  |   | SSH Host  |
              | tmux      |      | A (tmux)  |   | B (tmux)  |
              +-----------+      +-----------+   +-----------+
```

### Component Responsibilities

**SessionDiscoveryService**
- Poll tmux for active sessions (local + remote)
- Identify Claude Code sessions by process name or markers
- Maintain session registry with metadata

**SSHConnectionManager**
- Manage persistent SSH connections to remote hosts
- Execute tmux commands on remote hosts
- Handle reconnection and error recovery

**TerminalBridge**
- Create PTY bridges to tmux sessions
- Buffer and forward terminal I/O
- Handle attach/detach lifecycle

**WebSocketServer**
- Manage client connections
- Route terminal I/O to correct sessions
- Broadcast session state changes

**React Frontend**
- Grid layout for parallel session viewing
- xterm.js terminals for each session
- Session controls (start, stop, focus, resize)

---

## Must Have / Must NOT Have

### Must Have (Guardrails)
- Real-time terminal output with <500ms latency
- Support for at least 10 concurrent sessions
- Graceful handling of SSH disconnections
- Clean shutdown without orphaning processes
- Authentication for web access (basic auth minimum)

### Must NOT Have (Scope Exclusions)
- Session recording/playback (future feature)
- Multi-user collaboration (single user only)
- Mobile-optimized UI (desktop browser focus)
- Custom theming (use sensible defaults)
- Metrics/analytics dashboard

---

## Task Flow and Dependencies

```
Phase 1: Project Setup [P1-*]
    |
    v
Phase 2: Core Backend [P2-*]
    |
    +---> P2-1: Session Discovery (local tmux)
    |         |
    |         v
    +---> P2-2: Terminal Bridge (PTY management)
    |         |
    |         v
    +---> P2-3: WebSocket Server
    |
    v
Phase 3: Frontend Foundation [P3-*]
    |
    +---> P3-1: React setup with Vite
    |         |
    |         v
    +---> P3-2: xterm.js integration
    |         |
    |         v
    +---> P3-3: WebSocket client
    |
    v
Phase 4: Session Management [P4-*]
    |
    +---> P4-1: Session controls (start/stop)
    |         |
    |         v
    +---> P4-2: Grid layout UI
    |
    v
Phase 5: SSH Support [P5-*]
    |
    +---> P5-1: SSH connection manager
    |         |
    |         v
    +---> P5-2: Remote session discovery
    |         |
    |         v
    +---> P5-3: Remote terminal bridging
    |
    v
Phase 6: Polish & Security [P6-*]
    |
    +---> P6-1: Authentication
    +---> P6-2: Error handling & recovery
    +---> P6-3: Configuration system
```

---

## Detailed TODOs

### Phase 1: Project Setup

#### P1-1: Initialize Node.js project with TypeScript
**Files to create:**
- `package.json` - Project manifest with dependencies
- `tsconfig.json` - TypeScript configuration
- `src/index.ts` - Entry point
- `src/server/app.ts` - Fastify app with CORS
- `.gitignore` - Git ignore rules

**CORS Configuration (CRITICAL):**
```typescript
// src/server/app.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

// CORS configuration for frontend dev server
await app.register(cors, {
  origin: [
    'http://localhost:5173',  // Vite dev server
    'http://127.0.0.1:5173',
    // Production: add actual domain
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,  // Required for cookies/auth headers
});

// Alternative: Vite proxy configuration (if preferred over CORS)
// In frontend/vite.config.ts:
// export default defineConfig({
//   server: {
//     proxy: {
//       '/api': 'http://localhost:3000',
//       '/ws': {
//         target: 'ws://localhost:3000',
//         ws: true,
//       },
//     },
//   },
// });
```

**Dependencies to include:**
```json
{
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/websocket": "^10.0.0",
    "ws": "^8.17.0",
    "node-pty": "^1.0.0",
    "ssh2": "^1.15.0",
    "jsonwebtoken": "^9.0.0",
    "bcrypt": "^5.1.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "@types/bcrypt": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.0",
    "tsx": "^4.0.0"
  }
}
```

**Acceptance Criteria:**
- [ ] `npm install` completes without errors
- [ ] `npm run build` produces JavaScript output
- [ ] `npm run dev` starts development server
- [ ] CORS allows requests from localhost:5173
- [ ] OPTIONS preflight requests return correct headers

---

#### P1-2: Initialize React frontend with Vite
**Files to create:**
- `frontend/package.json` - Frontend dependencies
- `frontend/vite.config.ts` - Vite configuration
- `frontend/tsconfig.json` - Frontend TypeScript config
- `frontend/src/main.tsx` - React entry point
- `frontend/src/App.tsx` - Root component
- `frontend/index.html` - HTML template
- `frontend/tailwind.config.js` - Tailwind configuration

**Acceptance Criteria:**
- [ ] `npm run dev` (in frontend/) starts Vite dev server
- [ ] Browser shows React app at localhost:5173
- [ ] Tailwind CSS classes work

---

### Phase 2: Core Backend

#### P2-1: Implement local tmux session discovery
**Files to create:**
- `src/services/SessionDiscoveryService.ts` - Session discovery logic
- `src/types/Session.ts` - Session type definitions
- `src/utils/tmux.ts` - tmux command utilities

**Implementation details:**
```typescript
// Discovery approach:
// 1. Run `tmux list-sessions -F "#{session_id}:#{session_name}:#{session_windows}:#{session_created}"`
// 2. For each session, run `tmux list-panes -t {session} -F "#{pane_id}:#{pane_pid}:#{pane_current_command}:#{pane_width}:#{pane_height}"`
// 3. Apply Claude detection logic (see below)
// 4. Build Session objects with all metadata
```

**Claude Session Detection Criteria (CRITICAL):**
```typescript
/**
 * A pane is considered a Claude Code session if ANY of these conditions are true:
 *
 * PRIMARY DETECTION (fast, preferred):
 * 1. pane_current_command === 'claude'
 *    - Direct match when claude is the foreground process
 *
 * SECONDARY DETECTION (fallback for edge cases):
 * 2. pane_current_command matches /^claude(\s|$)/
 *    - Handles 'claude --arg' variations
 *
 * TERTIARY DETECTION (comprehensive, slower):
 * 3. Process tree inspection via: pgrep -P {pane_pid} -a | grep -q 'claude'
 *    - Catches claude running as child of shell
 *    - Used when primary/secondary fail but session name suggests claude
 *
 * EXCLUDED (not Claude sessions):
 * - pane_current_command === 'bash' or 'zsh' with no claude child
 * - Session name contains 'claude' but no claude process found
 */

export function isClaudeSession(pane: TmuxPane): boolean {
  const cmd = pane.currentCommand.toLowerCase();

  // Primary: exact match
  if (cmd === 'claude') return true;

  // Secondary: starts with claude
  if (/^claude(\s|$)/.test(cmd)) return true;

  // Tertiary: check process tree (only if session name hints at claude)
  // This is expensive - use sparingly
  return false; // Let caller decide whether to do pgrep
}

export async function isClaudeSessionDeep(pane: TmuxPane): Promise<boolean> {
  if (isClaudeSession(pane)) return true;

  // Check child processes
  try {
    const { stdout } = await exec(`pgrep -P ${pane.pid} -a 2>/dev/null || true`);
    return /\bclaude\b/.test(stdout);
  } catch {
    return false;
  }
}
```

**Tmux Output Parsing (handling special characters):**
```typescript
/**
 * Tmux session names can contain colons. Use a unique delimiter.
 *
 * Format string uses ASCII Unit Separator (0x1F) as delimiter:
 * tmux list-sessions -F '#{session_id}\x1F#{session_name}\x1F#{session_windows}'
 *
 * Parsing:
 * const DELIMITER = '\x1F';
 * const [sessionId, sessionName, windowCount] = line.split(DELIMITER);
 */
```

**Acceptance Criteria:**
- [ ] Correctly identifies all tmux sessions
- [ ] Detects which sessions are running Claude Code using 3-tier detection
- [ ] Handles session names with special characters (colons, spaces)
- [ ] Returns structured session data with IDs, names, state

---

#### P2-2: Implement terminal bridge with node-pty
**Files to create:**
- `src/services/TerminalBridge.ts` - PTY management
- `src/types/Terminal.ts` - Terminal type definitions

**Implementation details:**
```typescript
// Bridge approach:
// 1. Use `tmux attach-session -t {session} -r` for read-only capture
// 2. For interactive: create PTY, run `tmux attach-session -t {session}`
// 3. Forward PTY I/O to WebSocket
// 4. Handle resize events
```

**Acceptance Criteria:**
- [ ] Can capture live output from tmux session
- [ ] Can send input to tmux session
- [ ] Handles terminal resize correctly
- [ ] Cleans up PTY on disconnect

---

#### P2-3: Implement WebSocket server
**Files to create:**
- `src/server/WebSocketServer.ts` - WebSocket handling
- `src/server/MessageHandler.ts` - Protocol message handling
- `src/types/Protocol.ts` - WebSocket protocol types

**Protocol messages:**
```typescript
// Client -> Server
{ type: 'subscribe', sessionId: string }
{ type: 'unsubscribe', sessionId: string }
{ type: 'input', sessionId: string, data: string }
{ type: 'resize', sessionId: string, cols: number, rows: number }
{ type: 'list-sessions' }

// Server -> Client
{ type: 'sessions', sessions: Session[] }
{ type: 'output', sessionId: string, data: string }
{ type: 'session-added', session: Session }
{ type: 'session-removed', sessionId: string }
```

**Acceptance Criteria:**
- [ ] Handles multiple concurrent client connections
- [ ] Routes messages to correct session bridges
- [ ] Broadcasts session state changes
- [ ] Handles client disconnection gracefully

---

### Phase 3: Frontend Foundation

#### P3-1: Create React app structure
**Files to create:**
- `frontend/src/components/SessionGrid.tsx` - Grid layout container
- `frontend/src/components/SessionTile.tsx` - Individual session tile
- `frontend/src/hooks/useWebSocket.ts` - WebSocket connection hook
- `frontend/src/hooks/useSessions.ts` - Session state management
- `frontend/src/types/Session.ts` - Frontend type definitions

**Acceptance Criteria:**
- [ ] Clean component hierarchy established
- [ ] TypeScript types match backend protocol
- [ ] Basic state management working

---

#### P3-2: Integrate xterm.js for terminal rendering
**Files to create:**
- `frontend/src/components/Terminal.tsx` - xterm.js wrapper
- `frontend/src/hooks/useTerminal.ts` - Terminal lifecycle hook

**Implementation details:**
```typescript
// xterm.js integration:
// 1. Create Terminal instance in component
// 2. Attach FitAddon for auto-sizing
// 3. Connect to WebSocket for I/O
// 4. Handle resize events from container

/**
 * xterm.js v5.x Configuration
 *
 * Renderer Selection Strategy:
 * - Primary: WebGL renderer (@xterm/addon-webgl)
 *   - Best performance for multiple terminals
 *   - GPU-accelerated
 * - Fallback: Canvas renderer (built-in)
 *   - Used when WebGL unavailable (older browsers, VM guests)
 *   - Auto-detected via try/catch on WebGL init
 *
 * Required Addons:
 * - @xterm/addon-fit: Auto-resize terminal to container
 * - @xterm/addon-webgl: GPU rendering (with canvas fallback)
 * - @xterm/addon-unicode11: Unicode support for special characters
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';

function createTerminal(container: HTMLElement): Terminal {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
    },
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new Unicode11Addon());

  term.open(container);

  // Try WebGL, fall back to Canvas
  try {
    term.loadAddon(new WebglAddon());
  } catch (e) {
    console.warn('WebGL not available, using Canvas renderer');
  }

  fitAddon.fit();
  return term;
}
```

**Acceptance Criteria:**
- [ ] Terminal renders correctly in browser
- [ ] Text appears with proper formatting/colors (ANSI codes)
- [ ] Terminal auto-fits to container
- [ ] Resize works smoothly
- [ ] WebGL renderer used when available (Canvas fallback)
- [ ] Unicode characters display correctly

---

#### P3-3: Implement WebSocket client
**Files to create:**
- `frontend/src/services/WebSocketClient.ts` - WebSocket connection manager
- `frontend/src/context/SessionContext.tsx` - React context for session state

**WebSocket Reconnection Strategy:**
```typescript
/**
 * Exponential backoff with jitter for reconnection
 *
 * Parameters:
 * - Initial delay: 1000ms
 * - Max delay: 30000ms (30 seconds)
 * - Multiplier: 2x
 * - Jitter: ±20%
 * - Max attempts: unlimited (keep trying forever)
 *
 * Sequence: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s...
 */
export class ReconnectingWebSocket {
  private reconnectAttempt = 0;
  private readonly baseDelay = 1000;
  private readonly maxDelay = 30000;
  private readonly multiplier = 2;
  private readonly jitterFactor = 0.2;

  private getNextDelay(): number {
    const delay = Math.min(
      this.baseDelay * Math.pow(this.multiplier, this.reconnectAttempt),
      this.maxDelay
    );
    const jitter = delay * this.jitterFactor * (Math.random() * 2 - 1);
    this.reconnectAttempt++;
    return Math.round(delay + jitter);
  }

  private resetReconnect(): void {
    this.reconnectAttempt = 0;
  }

  // On successful connection: resetReconnect()
  // On disconnect: setTimeout(connect, getNextDelay())
}
```

**Acceptance Criteria:**
- [ ] Connects to backend WebSocket server
- [ ] Reconnects automatically on disconnect with exponential backoff
- [ ] Caps reconnection delay at 30 seconds
- [ ] Resets backoff on successful connection
- [ ] Dispatches messages to correct components
- [ ] Updates React state on session changes
- [ ] Shows connection status indicator in UI

---

### Phase 4: Session Management

#### P4-1: Implement session controls
**Backend files:**
- `src/services/SessionManager.ts` - Session lifecycle management
- `src/api/sessions.ts` - REST API for session operations

**Frontend files:**
- `frontend/src/components/SessionControls.tsx` - Control buttons UI
- `frontend/src/components/NewSessionDialog.tsx` - New session form

**API Endpoints with Full Schemas:**

```typescript
/**
 * POST /api/sessions - Create new Claude session
 *
 * Request Body (CreateSessionRequest):
 * {
 *   "workingDirectory": "/home/user/project",  // Required: absolute path
 *   "hostId": "local",                          // Required: 'local' or configured host ID
 *   "sessionName": "my-claude-session",         // Optional: tmux session name
 *   "claudeArgs": ["--model", "opus"]           // Optional: CLI arguments
 * }
 *
 * Response (201 Created):
 * {
 *   "session": { ...Session object }
 * }
 *
 * Errors:
 * - 400: Invalid working directory or host ID
 * - 404: Host not found (for remote hosts)
 * - 500: Failed to create tmux session
 */

/**
 * DELETE /api/sessions/:id - Kill session
 *
 * Path params:
 *   id: string - Session ID (format: {hostId}:{tmuxSessionId})
 *
 * Response (204 No Content)
 *
 * Errors:
 * - 404: Session not found
 * - 500: Failed to kill session
 */

/**
 * GET /api/sessions - List all sessions
 *
 * Query params:
 *   hostId?: string - Filter by host (optional)
 *   claudeOnly?: boolean - Only return Claude sessions (default: true)
 *
 * Response (200 OK):
 * {
 *   "sessions": Session[]
 * }
 */

/**
 * POST /api/sessions/:id/focus - Bring session to front (UI hint)
 *
 * This is a client-side preference hint, stored per-client.
 * Does not affect tmux state.
 *
 * Response (200 OK):
 * { "focused": true }
 */
```

**Backend Implementation:**
```typescript
// src/api/sessions.ts
import { FastifyInstance } from 'fastify';
import { CreateSessionRequest, Session } from '../types/Session';

export async function sessionRoutes(app: FastifyInstance) {
  // Create session
  app.post<{ Body: CreateSessionRequest }>('/api/sessions', {
    schema: {
      body: {
        type: 'object',
        required: ['workingDirectory', 'hostId'],
        properties: {
          workingDirectory: { type: 'string', minLength: 1 },
          hostId: { type: 'string', minLength: 1 },
          sessionName: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
          claudeArgs: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request, reply) => {
    const { workingDirectory, hostId, sessionName, claudeArgs } = request.body;
    // Implementation...
  });

  // List sessions
  app.get('/api/sessions', async (request, reply) => {
    // Implementation...
  });

  // Delete session
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    // Implementation...
  });
}
```

**Acceptance Criteria:**
- [ ] Can start new Claude Code session from browser with working directory and host
- [ ] Can pass optional claude CLI arguments
- [ ] Validates working directory exists (for local sessions)
- [ ] Can stop/kill existing session
- [ ] UI updates immediately on state change

---

#### P4-2: Implement grid layout UI
**Files to create:**
- `frontend/src/components/GridLayout.tsx` - CSS Grid container
- `frontend/src/components/SessionHeader.tsx` - Session title bar
- `frontend/src/styles/grid.css` - Grid-specific styles

**Layout features:**
- Responsive grid (1-4 columns based on viewport)
- Session tiles with header + terminal area
- Focus mode (maximize single session)
- Drag to reorder (optional enhancement)

**Acceptance Criteria:**
- [ ] Grid displays all sessions simultaneously
- [ ] Layout adapts to window size
- [ ] Can click to focus individual session
- [ ] Keyboard navigation works

---

### Phase 5: SSH Support

#### P5-1: Implement SSH connection manager
**Files to create:**
- `src/services/SSHConnectionManager.ts` - SSH connection pool
- `src/config/hosts.ts` - Host configuration loader
- `config/hosts.example.json` - Example host config

**Configuration format (Extended):**
```json
{
  "hosts": [
    {
      "id": "server-1",
      "name": "Dev Server",
      "hostname": "dev.example.com",
      "port": 22,
      "username": "developer",
      "privateKeyPath": "~/.ssh/id_rsa",
      "passphrase": null,
      "passphraseEnvVar": "SSH_SERVER1_PASSPHRASE",
      "useAgent": true,
      "jumpHost": null
    },
    {
      "id": "internal-server",
      "name": "Internal Server (via bastion)",
      "hostname": "internal.private",
      "port": 22,
      "username": "admin",
      "privateKeyPath": "~/.ssh/id_ed25519",
      "useAgent": true,
      "jumpHost": {
        "hostname": "bastion.example.com",
        "port": 22,
        "username": "jump-user",
        "privateKeyPath": "~/.ssh/bastion_key"
      }
    }
  ]
}
```

**SSH Host Interface:**
```typescript
export interface SSHHostConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  privateKeyPath: string;

  /** Direct passphrase (not recommended - use passphraseEnvVar) */
  passphrase?: string;

  /** Environment variable containing passphrase */
  passphraseEnvVar?: string;

  /** Whether to use ssh-agent for authentication (default: true) */
  useAgent?: boolean;

  /** Jump host / bastion server configuration */
  jumpHost?: {
    hostname: string;
    port: number;
    username: string;
    privateKeyPath: string;
    passphrase?: string;
    passphraseEnvVar?: string;
  };
}

/**
 * Passphrase Resolution Order:
 * 1. If useAgent=true, try ssh-agent first
 * 2. If passphraseEnvVar set, read from environment
 * 3. If passphrase set directly, use it
 * 4. If none available and key is encrypted, connection fails with clear error
 *
 * Jump Host Flow:
 * 1. Connect to jump host first
 * 2. Use jump connection to forward to target host
 * 3. Execute tmux commands on target through tunnel
 */
```

**Acceptance Criteria:**
- [ ] Establishes SSH connections to configured hosts
- [ ] Reuses connections (connection pooling)
- [ ] Handles authentication (key-based)
- [ ] Supports passphrase-protected keys via ssh-agent or env var
- [ ] Supports jump hosts / bastion servers
- [ ] Reconnects on connection drop
- [ ] Clear error messages for authentication failures

---

#### P5-2: Remote session discovery
**Modify:**
- `src/services/SessionDiscoveryService.ts` - Add remote discovery

**Implementation:**
```typescript
// Remote discovery:
// 1. Execute tmux commands over SSH
// 2. Parse output same as local
// 3. Tag sessions with host ID
// 4. Aggregate with local sessions
```

**Acceptance Criteria:**
- [ ] Discovers sessions on all configured hosts
- [ ] Sessions are tagged with host identifier
- [ ] Discovery works in parallel across hosts
- [ ] Handles host unavailability gracefully

---

#### P5-3: Remote terminal bridging
**Modify:**
- `src/services/TerminalBridge.ts` - Add SSH terminal support

**Implementation:**
```typescript
// Remote terminal bridge:
// 1. Create SSH channel to host
// 2. Execute `tmux attach-session -t {session}` on channel
// 3. Forward channel I/O to WebSocket
// 4. Handle channel close/errors
```

**Acceptance Criteria:**
- [ ] Can stream output from remote tmux sessions
- [ ] Can send input to remote sessions
- [ ] Latency acceptable (<1s for remote)
- [ ] Handles network issues gracefully

---

### Phase 6: Polish and Security

#### P6-1: Add authentication
**Files to create:**
- `src/middleware/auth.ts` - Authentication middleware
- `src/services/AuthService.ts` - Token generation and validation
- `frontend/src/components/Login.tsx` - Login form
- `frontend/src/services/AuthService.ts` - Client-side auth management

**Authentication Flow:**

```typescript
/**
 * AUTH FLOW SPECIFICATION
 *
 * 1. LOGIN (REST API):
 *    POST /api/auth/login
 *    Body: { username: string, password: string }
 *    Response: { token: string, expiresAt: string }
 *
 * 2. TOKEN STORAGE:
 *    Client stores token in localStorage: 'session-manager-token'
 *
 * 3. REST API AUTHENTICATION:
 *    All requests include: Authorization: Bearer {token}
 *
 * 4. WEBSOCKET AUTHENTICATION (CRITICAL):
 *    Method: URL query parameter + first-message validation
 *
 *    Step 1: Connect with token in URL
 *      ws://localhost:3000/ws?token={jwt_token}
 *
 *    Step 2: Server validates token before completing upgrade
 *      - Invalid/missing token → 401 response, connection rejected
 *      - Valid token → Connection accepted
 *
 *    Step 3: Periodic re-validation
 *      - Server checks token expiry every 60 seconds
 *      - Expired token → Server sends { type: 'auth-expired' } and closes
 *
 *    Token Refresh:
 *      - Client can send: { type: 'auth-refresh', token: newToken }
 *      - Server validates and updates connection's auth state
 */

export interface AuthConfig {
  /** JWT secret (from env: AUTH_SECRET) */
  secret: string;
  /** Token expiry in seconds (default: 86400 = 24 hours) */
  tokenExpiry: number;
  /** Username (from env: AUTH_USERNAME) */
  username: string;
  /** Password hash (from env: AUTH_PASSWORD_HASH, bcrypt) */
  passwordHash: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string; // ISO 8601
}

export interface WebSocketAuthMessage {
  type: 'auth-refresh';
  token: string;
}
```

**WebSocket Server Auth Implementation:**
```typescript
// In WebSocketServer.ts
import { verifyToken } from './AuthService';

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Missing authentication token');
    return;
  }

  try {
    const payload = verifyToken(token);
    ws.userId = payload.sub;
    ws.tokenExp = payload.exp;
  } catch (err) {
    ws.close(4002, 'Invalid authentication token');
    return;
  }

  // Set up periodic expiry check
  const authCheck = setInterval(() => {
    if (Date.now() / 1000 > ws.tokenExp) {
      ws.send(JSON.stringify({ type: 'auth-expired' }));
      ws.close(4003, 'Token expired');
      clearInterval(authCheck);
    }
  }, 60000);

  ws.on('close', () => clearInterval(authCheck));
});
```

**Acceptance Criteria:**
- [ ] Cannot access UI without login
- [ ] WebSocket requires token in URL query param
- [ ] Invalid WebSocket token results in connection rejection (4001/4002)
- [ ] Expired tokens trigger auth-expired message and disconnect
- [ ] Token refresh mechanism works without reconnection
- [ ] Logout clears localStorage and redirects to login

---

#### P6-2: Error handling and recovery
**Modify:**
- All service files - Add error handling
- Frontend components - Add error states

**Error scenarios to handle:**
- tmux server not running
- SSH connection failed
- WebSocket disconnected
- Session terminated unexpectedly

**Acceptance Criteria:**
- [ ] Errors shown to user clearly
- [ ] Auto-recovery where possible
- [ ] No crashes on edge cases

---

#### P6-3: Configuration system
**Files to create:**
- `src/config/index.ts` - Configuration loader
- `config/default.json` - Default configuration
- `.env.example` - Environment variables template

**Configurable items:**
- Server port
- WebSocket path
- SSH hosts
- Authentication credentials
- Discovery poll interval

**Acceptance Criteria:**
- [ ] Configuration loaded from file/env
- [ ] Sensible defaults provided
- [ ] Validation on startup

---

## Commit Strategy

| Phase | Commit Message |
|-------|---------------|
| P1-1 | feat: initialize backend with TypeScript and Fastify |
| P1-2 | feat: initialize React frontend with Vite and Tailwind |
| P2-1 | feat: implement local tmux session discovery |
| P2-2 | feat: implement terminal bridge with node-pty |
| P2-3 | feat: implement WebSocket server for real-time communication |
| P3-1 | feat: create React app structure and state management |
| P3-2 | feat: integrate xterm.js for terminal rendering |
| P3-3 | feat: implement WebSocket client with auto-reconnect |
| P4-1 | feat: add session control API and UI |
| P4-2 | feat: implement responsive grid layout for sessions |
| P5-1 | feat: add SSH connection manager |
| P5-2 | feat: extend discovery to remote SSH hosts |
| P5-3 | feat: implement remote terminal bridging |
| P6-1 | feat: add basic authentication |
| P6-2 | fix: comprehensive error handling and recovery |
| P6-3 | feat: add configuration system |

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| node-pty compatibility issues | HIGH | MEDIUM | Use prebuilt binaries, test early in P2-2 |
| SSH key authentication complexity | MEDIUM | MEDIUM | Support ssh-agent, document requirements |
| xterm.js performance with many sessions | MEDIUM | LOW | Implement virtualization, pause hidden terminals |
| tmux version differences | LOW | LOW | Test against tmux 3.0+, document requirements |
| WebSocket message ordering | MEDIUM | LOW | Add sequence numbers if issues arise |
| Memory leaks from PTY/SSH | HIGH | MEDIUM | Implement proper cleanup, monitor in dev |

---

## Verification Steps

### Functional Verification

1. **Local Session Discovery**
   ```bash
   # Start Claude in tmux
   tmux new-session -d -s test-claude "claude"
   # Verify backend discovers it
   curl http://localhost:3000/api/sessions | jq
   ```

2. **Real-time Output**
   - Open browser to http://localhost:3000
   - Interact with Claude in tmux directly
   - Verify output appears in browser <500ms

3. **Input from Browser**
   - Type in browser terminal
   - Verify input reaches Claude session
   - Verify response appears in browser

4. **Session Control**
   - Create new session from browser
   - Verify it appears in grid
   - Stop session from browser
   - Verify it disappears from grid

5. **SSH Remote Sessions**
   - Configure remote host
   - Start Claude session on remote
   - Verify it appears in browser
   - Verify I/O works through browser

### Performance Verification

1. **Latency Test**
   - Measure time from keystroke to echo
   - Target: <100ms local, <500ms remote

2. **Concurrent Sessions**
   - Open 10 Claude sessions
   - All should render smoothly
   - No memory/CPU spikes

### Security Verification

1. **Authentication**
   - Access without login should fail
   - Invalid credentials should fail
   - Valid credentials should succeed

---

## Success Criteria

### Minimum Viable Product (MVP)
- [ ] Discover and list local Claude Code tmux sessions
- [ ] Display session output in real-time in browser
- [ ] Send input to sessions from browser
- [ ] Grid view shows 4+ sessions simultaneously
- [ ] Basic auth protects access

### Full Implementation
- [ ] All MVP criteria met
- [ ] SSH remote host support working
- [ ] Start/stop sessions from browser
- [ ] Handles 10+ concurrent sessions
- [ ] Reconnection and error recovery
- [ ] Configuration via file/environment

---

## Appendix: File Structure

```
session-manager/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── config/
│   ├── default.json
│   └── hosts.example.json
├── src/
│   ├── index.ts                    # Entry point
│   ├── server/
│   │   ├── app.ts                  # Fastify app setup
│   │   ├── WebSocketServer.ts      # WebSocket handling
│   │   └── MessageHandler.ts       # Protocol handling
│   ├── services/
│   │   ├── SessionDiscoveryService.ts
│   │   ├── SessionManager.ts
│   │   ├── TerminalBridge.ts
│   │   └── SSHConnectionManager.ts
│   ├── api/
│   │   └── sessions.ts             # REST endpoints
│   ├── middleware/
│   │   └── auth.ts                 # Authentication
│   ├── config/
│   │   ├── index.ts                # Config loader
│   │   └── hosts.ts                # Host config
│   ├── types/
│   │   ├── Session.ts
│   │   ├── Terminal.ts
│   │   └── Protocol.ts
│   └── utils/
│       └── tmux.ts                 # tmux utilities
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── SessionGrid.tsx
│       │   ├── SessionTile.tsx
│       │   ├── SessionHeader.tsx
│       │   ├── SessionControls.tsx
│       │   ├── Terminal.tsx
│       │   ├── GridLayout.tsx
│       │   ├── Login.tsx
│       │   └── NewSessionDialog.tsx
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   ├── useSessions.ts
│       │   └── useTerminal.ts
│       ├── services/
│       │   └── WebSocketClient.ts
│       ├── context/
│       │   └── SessionContext.tsx
│       ├── types/
│       │   └── Session.ts
│       └── styles/
│           └── grid.css
└── docs/
    └── architecture.md
```

---

*Plan generated by Prometheus (Planner Agent)*
*Ready for Critic review*
