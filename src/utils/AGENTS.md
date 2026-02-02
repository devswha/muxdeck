<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# src/utils

Utility functions and helpers for the session manager backend, including tmux command parsing and process detection.

## Purpose

Provides pure utility functions for:
- **tmux command execution and parsing** - List sessions, list panes, send commands
- **Claude session detection** - Fast and deep process tree analysis
- **Shell output parsing** - Structured data extraction from tmux command output

## Key Files

| File | Description |
|------|-------------|
| **tmux.ts** | tmux interaction utilities - list sessions/panes, parse output, detect Claude sessions |

## Architecture

```
tmux.ts
├─ Constants
│  └─ DELIMITER ('|||') - Output field separator
├─ Interfaces
│  ├─ TmuxSession - Session metadata
│  └─ TmuxPane - Pane state and properties
└─ Functions
   ├─ listTmuxSessions() - Get all sessions
   ├─ listTmuxPanes() - Get panes for a session
   ├─ isClaudeSessionFast() - Quick command matching
   └─ isClaudeSessionDeep() - Process tree analysis
```

## Core Types

### TmuxSession

```typescript
interface TmuxSession {
  sessionId: string;      // tmux session ID (e.g., "$0", "$1")
  sessionName: string;    // User-friendly session name
  windowCount: number;    // Number of windows in session
  createdAt: number;      // Unix timestamp when session was created
}
```

**Usage**: Represents a tmux session as discovered via `tmux list-sessions`.

### TmuxPane

```typescript
interface TmuxPane {
  paneId: string;         // tmux pane ID (e.g., "0", "1")
  pid: number;            // Operating system PID of pane process
  currentCommand: string; // Current command running in pane
  width: number;          // Pane width in columns
  height: number;         // Pane height in rows
  windowIndex: number;    // Which window in session (0-based)
  currentPath: string;    // Current working directory in pane
}
```

**Usage**: Represents state of a single pane within a tmux session.

## Core Functions

### listTmuxSessions()

Lists all active tmux sessions on the current system.

```typescript
export async function listTmuxSessions(): Promise<TmuxSession[]>
```

**Behavior**
- Executes: `tmux list-sessions -F '{format}'`
- Parses output using `DELIMITER` ('|||') to separate fields
- Returns empty array if tmux not available or no sessions running
- Gracefully handles errors (returns `[]`)

**Example**
```typescript
const sessions = await listTmuxSessions();
// Result:
// [
//   {
//     sessionId: "$0",
//     sessionName: "claude-session-1",
//     windowCount: 1,
//     createdAt: 1704067200000
//   },
//   {
//     sessionId: "$1",
//     sessionName: "editor",
//     windowCount: 2,
//     createdAt: 1704067300000
//   }
// ]
```

**When to use**
- Initial session discovery on application startup
- Polling for new sessions (with `SessionDiscoveryService`)
- Verifying session existence before attachment

### listTmuxPanes()

Lists all panes within a specific tmux session.

```typescript
export async function listTmuxPanes(sessionName: string): Promise<TmuxPane[]>
```

**Parameters**
- `sessionName` - Session identifier (session name or ID from `TmuxSession.sessionName`)

**Behavior**
- Executes: `tmux list-panes -t '{sessionName}' -F '{format}'`
- Parses pane output using `DELIMITER` separator
- Returns empty array if session not found or has no panes
- Gracefully handles errors (returns `[]`)

**Example**
```typescript
const panes = await listTmuxPanes('claude-session-1');
// Result:
// [
//   {
//     paneId: "%0.0",
//     pid: 12345,
//     currentCommand: "bash",
//     width: 80,
//     height: 24,
//     windowIndex: 0,
//     currentPath: "/home/user/projects/session-manager"
//   },
//   {
//     paneId: "%0.1",
//     pid: 12346,
//     currentCommand: "vim",
//     width: 80,
//     height: 24,
//     windowIndex: 0,
//     currentPath: "/home/user/projects/session-manager"
//   }
// ]
```

**When to use**
- Getting list of active panes in a session
- Finding pane PIDs for process detection
- Getting current working directory of a pane
- Determining session structure (windows/panes)

### isClaudeSessionFast()

Quick detection of Claude sessions via command matching (synchronous).

```typescript
export function isClaudeSessionFast(pane: TmuxPane): boolean
```

**Behavior**
- **Primary match**: Exact command is "claude" (case-insensitive)
- **Secondary match**: Command starts with "claude " or "claude\n" (regex: `/^claude(\s|$)/i`)
- Synchronous - no shell execution
- Always returns quickly (string comparison)

**Example**
```typescript
// Claude session - direct match
isClaudeSessionFast({
  currentCommand: 'claude',
  // ... other fields
}); // → true

// Claude session - with arguments
isClaudeSessionFast({
  currentCommand: 'claude --no-confirm --model opus',
  // ... other fields
}); // → true

// Not a Claude session
isClaudeSessionFast({
  currentCommand: 'bash',
  // ... other fields
}); // → false

// False negative - child process not visible
isClaudeSessionFast({
  currentCommand: 'tmux',  // Parent process running tmux
  // ... other fields
}); // → false (use isClaudeSessionDeep for this)
```

**Performance**
- O(1) string operations
- No I/O, no shell execution
- Safe for filtering large pane lists

**Limitations**
- Only detects Claude if it's the direct pane command
- Misses Claude running as a child process (e.g., inside tmux, bash script)
- Use `isClaudeSessionDeep()` for comprehensive detection

### isClaudeSessionDeep()

Comprehensive Claude session detection via process tree analysis.

```typescript
export async function isClaudeSessionDeep(pane: TmuxPane): Promise<boolean>
```

**Behavior**
1. First tries fast check: `isClaudeSessionFast()`
2. If fast check succeeds, returns `true` immediately
3. If fast check fails, runs process tree analysis:
   - Executes: `pgrep -P {pid} -a` (list all children of pane process)
   - Searches output for "claude" pattern (word-bounded, case-insensitive)
4. Returns `true` if "claude" found in process tree
5. Gracefully handles errors (returns `false`)

**Example**
```typescript
// Direct Claude command
await isClaudeSessionDeep({
  currentCommand: 'claude',
  pid: 12345,
  // ... other fields
}); // → true (fast path)

// Claude running as child of bash
await isClaudeSessionDeep({
  currentCommand: 'bash',
  pid: 12345,
  // ... other fields
});
// Runs: pgrep -P 12345 -a
// Output: 12346 /usr/local/bin/claude --model opus
// → true (found in process tree)

// No Claude in process tree
await isClaudeSessionDeep({
  currentCommand: 'vim',
  pid: 12345,
  // ... other fields
}); // → false
```

**Performance**
- Typically <100ms on modern systems
- Synchronous fast path if command is Claude
- One system call (`pgrep`) for deep check
- Safe for filtering moderate-sized pane lists

**When to use**
- Comprehensive session identification
- Building canonical list of Claude sessions
- User-facing session filtering
- Ignore results if performance is critical for many panes

**When NOT to use**
- Filtering hundreds/thousands of panes in tight loop (use fast check instead)
- Real-time monitoring where <10ms latency needed (use fast check instead)

## Constants

### DELIMITER

Multi-character field separator for tmux output parsing.

```typescript
export const DELIMITER = '|||';
```

**Purpose**
- Separates fields in tmux command output
- Three pipe characters chosen to avoid shell escaping issues
- Single-pipe `|` could conflict with shell pipes; `|||` is unambiguous

**Usage in output format**
```typescript
const format = `#{session_id}${DELIMITER}#{session_name}${DELIMITER}#{session_windows}`;
// Produces: "$0|||my-session|||1"
// Parsed as: ["$0", "my-session", "1"]
```

## Integration Points

### SessionDiscoveryService

`src/services/SessionDiscoveryService.ts` uses these utilities to discover and track sessions:

```typescript
// Discover all sessions
const allSessions = await listTmuxSessions();

// Check each pane for Claude activity
for (const session of allSessions) {
  const panes = await listTmuxPanes(session.sessionName);
  for (const pane of panes) {
    if (await isClaudeSessionDeep(pane)) {
      // Track this Claude session
    }
  }
}
```

### SessionManager

`src/services/SessionManager.ts` uses `listTmuxSessions()` to verify session creation.

### TerminalBridge

`src/services/TerminalBridge.ts` uses `listTmuxPanes()` to find target pane before attaching.

## Error Handling

All functions gracefully handle errors:

```typescript
// listTmuxSessions
try {
  const sessions = await listTmuxSessions();
  // If exec() fails, returns []
} catch {
  return [];
}

// listTmuxPanes
try {
  const panes = await listTmuxPanes('session-name');
  // If exec() fails, returns []
} catch {
  return [];
}

// isClaudeSessionDeep
try {
  // pgrep fails → catch block returns false
} catch {
  return false;
}
```

**Implications**
- tmux not installed → returns empty arrays/false
- Session doesn't exist → returns empty array
- Permission denied → returns empty array/false
- Process not found → returns false
- No errors thrown (safe for production)

## Common Patterns

### Listing All Claude Sessions

```typescript
import { listTmuxSessions, listTmuxPanes, isClaudeSessionDeep } from './utils/tmux';

async function findAllClaudeSessions() {
  const allSessions = await listTmuxSessions();
  const claudeSessions = [];

  for (const session of allSessions) {
    const panes = await listTmuxPanes(session.sessionName);

    for (const pane of panes) {
      if (await isClaudeSessionDeep(pane)) {
        claudeSessions.push({
          session: session.sessionName,
          pane: pane.paneId,
          path: pane.currentPath,
          pid: pane.pid
        });
      }
    }
  }

  return claudeSessions;
}
```

### Quick Session Filtering

For performance-critical code, use fast check only:

```typescript
import { listTmuxPanes, isClaudeSessionFast } from './utils/tmux';

async function quickClaudeCheck(sessionName: string) {
  const panes = await listTmuxPanes(sessionName);
  return panes.filter(p => isClaudeSessionFast(p));
}
```

### Verifying Session Creation

```typescript
import { listTmuxSessions } from './utils/tmux';

async function waitForSessionCreation(sessionName: string, maxWaitMs = 5000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const sessions = await listTmuxSessions();

    if (sessions.some(s => s.sessionName === sessionName)) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}
```

## Testing

### Unit Tests

Test each function independently:

```typescript
// Test listTmuxSessions with no sessions
// Test listTmuxSessions with multiple sessions
// Test listTmuxPanes parsing
// Test isClaudeSessionFast with various commands
// Test isClaudeSessionDeep with real process tree
```

### Integration Tests

Test with actual tmux sessions:

```bash
# Create test session
tmux new-session -d -s test-session bash

# List sessions (should include test-session)
node -e "const tmux = require('./dist/utils/tmux'); tmux.listTmuxSessions().then(console.log)"

# Clean up
tmux kill-session -t test-session
```

### Edge Cases

- No tmux installed (should return `[]` or `false`)
- Session name with special characters
- Very long command strings
- Process with "claude" in name but not Claude CLI
- Multiple Claude instances in one session

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `listTmuxSessions()` returns `[]` | tmux not running or not in PATH | Install tmux: `apt-get install tmux` or `brew install tmux` |
| `listTmuxPanes()` returns `[]` | Session doesn't exist or no panes | Verify session exists: `tmux list-sessions` |
| `isClaudeSessionFast()` misses Claude | Claude running as child process | Use `isClaudeSessionDeep()` for comprehensive detection |
| `isClaudeSessionDeep()` is slow | Deep check running on many panes | Cache results or use fast check for filtering |
| Parsing errors in output | Unusual session/pane names | DELIMITER ('|||') should be unique enough; review output format |

## Performance Characteristics

| Function | Time | Notes |
|----------|------|-------|
| `listTmuxSessions()` | ~10-50ms | One tmux command; scales with session count |
| `listTmuxPanes(name)` | ~10-50ms | One tmux command; scales with pane count |
| `isClaudeSessionFast()` | <1ms | Synchronous string operations |
| `isClaudeSessionDeep()` | <100ms | One `pgrep` call if fast check fails |

**Optimization tips**
- Cache session list and invalidate on interval
- Use fast check for quick filtering; deep check only when needed
- Batch pane checks with Promise.all() but limit concurrency

## Dependencies

| Module | Purpose |
|--------|---------|
| `child_process` (promisified) | Execute tmux and pgrep commands |
| `util.promisify` | Convert callback-based exec to Promise |

No external npm packages required.

## MANUAL:

This documentation covers the tmux utility module's interface, behavior, and integration patterns. For updates:
1. Verify function signatures match current implementation
2. Test code examples against actual tmux commands
3. Update error handling section if new error cases added
4. Add new functions to Architecture and Key Functions sections
5. Review integration points if SessionDiscoveryService changes
