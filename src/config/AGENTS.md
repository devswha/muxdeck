<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# src/config

Configuration loading and management for the session manager application.

## Purpose

Loads and validates application configuration from multiple sources with environment variable overrides:
- **Default configuration** - Built-in defaults for all settings
- **File-based configuration** - JSON files from project root or user home directory
- **Environment variables** - Runtime overrides for server, auth, and discovery settings
- **SSH host configuration** - Manages SSH connection details for remote hosts with jump host support

## Architecture

```
┌─────────────────────────────────────────┐
│  Configuration Loading Pipeline         │
├─────────────────────────────────────────┤
│                                         │
│  1. Load Defaults                       │
│     └─> DEFAULT_CONFIG (in-memory)     │
│                                         │
│  2. Load Files (Sequential)             │
│     ├─> ./config/config.json           │
│     └─> ~/.config/session-manager/...  │
│                                         │
│  3. Load Environment Variables          │
│     ├─> PORT, HOST                     │
│     ├─> AUTH_ENABLED, AUTH_SECRET      │
│     ├─> DISCOVERY_INTERVAL             │
│     └─> AUTH_PASSWORD_HASH             │
│                                         │
│  4. Deep Merge (Priority: Env > File > Defaults)
│                                         │
│  5. Validate Configuration              │
│     ├─> Port range (1-65535)           │
│     ├─> Discovery interval (min 500ms) │
│     ├─> Auth secret if auth enabled    │
│     └─> Password hash if auth enabled  │
│                                         │
│  6. Cache & Return                      │
│     └─> Cached for app lifecycle       │
│                                         │
└─────────────────────────────────────────┘

SSH Host Configuration:
┌─────────────────────────────────────┐
│  Host Configuration Loading         │
├─────────────────────────────────────┤
│                                     │
│  1. Load hosts.json                 │
│     ├─> ./config/hosts.json         │
│     └─> ~/.config/session-manager/  │
│                                     │
│  2. Parse Host Array                │
│     └─> SSHHostConfig[] with schema │
│                                     │
│  3. Resolve Home Paths              │
│     ├─> ~/.ssh/id_rsa → /home/...   │
│     └─> Jump host keys              │
│                                     │
│  4. Return to Caller                │
│     └─> getAllHosts() or getHostById │
│                                     │
└─────────────────────────────────────┘
```

## Key Files

| File | Lines | Description |
|------|-------|-------------|
| **index.ts** | 182 | Main configuration loader. Exports `loadConfig()`, `getConfig()`, `reloadConfig()`. Implements caching, env override, and validation. |
| **hosts.ts** | 82 | SSH host configuration utilities. Exports `loadHostsConfig()`, `getAllHosts()`, `getHostConfig()`. Resolves `~` paths. |

## Data Structures

### ServerConfig
```typescript
interface ServerConfig {
  port: number;              // HTTP server port (default: 3000)
  host: string;              // Bind address (default: '0.0.0.0')
}
```

### WebSocketConfig
```typescript
interface WebSocketConfig {
  path: string;              // WebSocket endpoint path (default: '/ws')
  heartbeatInterval: number; // Ping interval in ms (default: 30000)
}
```

### DiscoveryConfig
```typescript
interface DiscoveryConfig {
  pollInterval: number;      // Session scan interval in ms (default: 2000, min: 500)
  includeNonClaude: boolean; // Include non-Claude tmux sessions (default: false)
}
```

### AuthConfig
```typescript
interface AuthConfig {
  enabled: boolean;          // Enable JWT authentication (default: false)
  secret: string;            // JWT signing secret (required if enabled)
  tokenExpiry: number;       // Token lifetime in seconds (default: 86400 = 24h)
  username: string;          // Auth username (default: 'admin')
  passwordHash: string;      // bcrypt hash (required if enabled)
}
```

### AppConfig
```typescript
interface AppConfig {
  server: ServerConfig;
  websocket: WebSocketConfig;
  discovery: DiscoveryConfig;
  auth: AuthConfig;
}
```

### SSHHostConfig
```typescript
interface SSHHostConfig {
  id: string;                // Unique host identifier
  name: string;              // Display name
  hostname: string;          // SSH hostname/IP
  port: number;              // SSH port (default: 22)
  username: string;          // SSH username
  privateKeyPath?: string;   // Path to private key (resolved: ~ → homedir)
  password?: string;         // Plaintext password (insecure, avoid)
  passwordEnvVar?: string;   // Read password from env var
  passphrase?: string;       // Key passphrase
  passphraseEnvVar?: string; // Read passphrase from env var
  useAgent?: boolean;        // Use SSH_AUTH_SOCK agent
  jumpHost?: JumpHostConfig; // Bastion/jump host config
}

interface JumpHostConfig {
  hostname: string;
  port: number;
  username: string;
  privateKeyPath?: string;   // Resolved with ~
  password?: string;
  passphrase?: string;
  passphraseEnvVar?: string;
}

interface HostsConfig {
  hosts: SSHHostConfig[];
}
```

## Configuration Paths (Search Order)

### Application Config
1. `./config/config.json` (project root)
2. `~/.config/session-manager/config.json` (user home)
3. Environment variables (override all files)
4. Defaults (fallback)

### Hosts Config
1. `./config/hosts.json` (project root)
2. `~/.config/session-manager/hosts.json` (user home)

## API Reference

### Configuration Loading

#### `loadConfig(): AppConfig`
Load configuration from files + environment with caching.
- Loads file config from priority paths
- Overlays environment variable config
- Merges with defaults (priority: env > file > defaults)
- Validates entire config
- Caches result for subsequent calls
- **Returns:** Complete validated `AppConfig`
- **Throws:** Error if validation fails

```typescript
const config = loadConfig();
console.log(config.server.port); // 3000 or from env/file
```

#### `getConfig(): AppConfig`
Get currently cached configuration (calls `loadConfig()` if not cached).
- Returns cached config if already loaded
- Calls `loadConfig()` on first use
- **Returns:** Cached `AppConfig`

```typescript
const config = getConfig(); // Reuses cached config
```

#### `reloadConfig(): AppConfig`
Force reload configuration from files and environment.
- Clears cache
- Calls `loadConfig()` fresh
- Useful after file changes
- **Returns:** Newly loaded `AppConfig`

```typescript
reloadConfig(); // Forces reload on next getConfig()
```

### Host Configuration

#### `loadHostsConfig(): HostsConfig`
Load SSH host configuration from files.
- Searches config paths in order
- Resolves `~` in key paths
- Returns empty array if no config found
- Logs loaded host count
- **Returns:** `HostsConfig` with `hosts` array
- **Side Effect:** Logs to console on success/failure

```typescript
const hostsConfig = loadHostsConfig();
console.log(`Loaded ${hostsConfig.hosts.length} hosts`);
```

#### `getAllHosts(): SSHHostConfig[]`
Get all configured SSH hosts.
- Calls `loadHostsConfig()` internally
- **Returns:** Array of `SSHHostConfig`

```typescript
const hosts = getAllHosts();
hosts.forEach(host => console.log(host.id, host.hostname));
```

#### `getHostConfig(hostId: string): SSHHostConfig | undefined`
Get single host by ID.
- Searches `config.hosts` by `id` field
- **Returns:** Matching `SSHHostConfig` or `undefined`

```typescript
const host = getHostConfig('prod-server');
if (host) {
  console.log(`Connecting to ${host.hostname}:${host.port}`);
}
```

## Environment Variables

### Server
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | 3000 | HTTP server port |
| `HOST` | string | '0.0.0.0' | Bind address |

### Authentication
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `AUTH_ENABLED` | boolean | false | Enable JWT authentication |
| `AUTH_SECRET` | string | 'change-this...' | JWT signing secret (required if enabled) |
| `AUTH_TOKEN_EXPIRY` | number | 86400 | Token lifetime in seconds |
| `AUTH_USERNAME` | string | 'admin' | Authentication username |
| `AUTH_PASSWORD_HASH` | string | '' | bcrypt hash (required if enabled) |

### Discovery
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DISCOVERY_INTERVAL` | number | 2000 | Session poll interval in ms (min: 500) |

### Example
```bash
# Start with custom port and auth enabled
PORT=8080 AUTH_ENABLED=true AUTH_SECRET=my-secret AUTH_PASSWORD_HASH='$2a$...' npm start

# Override via file config
cat config/config.json
{
  "server": { "port": 8080 },
  "auth": { "enabled": true, "secret": "file-secret" }
}
```

## File Format Examples

### config/config.json
```json
{
  "server": {
    "port": 3000,
    "host": "127.0.0.1"
  },
  "websocket": {
    "path": "/ws",
    "heartbeatInterval": 30000
  },
  "discovery": {
    "pollInterval": 2000,
    "includeNonClaude": false
  },
  "auth": {
    "enabled": false,
    "secret": "change-this-in-production",
    "tokenExpiry": 86400,
    "username": "admin",
    "passwordHash": ""
  }
}
```

### config/hosts.json
```json
{
  "hosts": [
    {
      "id": "local",
      "name": "Local Machine",
      "hostname": "localhost",
      "port": 22,
      "username": "user",
      "useAgent": true
    },
    {
      "id": "prod-server",
      "name": "Production Server",
      "hostname": "prod.example.com",
      "port": 22,
      "username": "ubuntu",
      "privateKeyPath": "~/.ssh/id_rsa",
      "useAgent": true
    },
    {
      "id": "bastion-jump",
      "name": "Via Bastion (Jump Host)",
      "hostname": "internal-server.local",
      "port": 22,
      "username": "dev",
      "privateKeyPath": "~/.ssh/internal_key",
      "jumpHost": {
        "hostname": "bastion.example.com",
        "port": 22,
        "username": "jump-user",
        "privateKeyPath": "~/.ssh/bastion_key"
      }
    },
    {
      "id": "password-auth",
      "name": "Server with Password Auth",
      "hostname": "oldserver.local",
      "port": 22,
      "username": "admin",
      "passwordEnvVar": "OLD_SERVER_PASS"
    }
  ]
}
```

## Validation Rules

Configuration validation enforces:

| Rule | Constraint | Error |
|------|-----------|-------|
| Port range | 1 ≤ port ≤ 65535 | "Invalid port number" |
| Discovery interval | pollInterval ≥ 500ms | "Discovery poll interval must be at least 500ms" |
| Auth secret | required if auth enabled | "Auth secret is required when auth is enabled" |
| Password hash | required if auth enabled | "Auth password hash is required when auth is enabled" |

## Implementation Details

### Caching
- Configuration is loaded once and cached in `cachedConfig`
- Subsequent `getConfig()` calls return cached value
- Call `reloadConfig()` to clear cache and reload from files/env

### Deep Merge Algorithm
```typescript
function deepMerge<T extends object>(target: T, source: Partial<T>): T
```
- Merges nested objects recursively
- Source undefined values are skipped
- Array values are NOT merged (replaced entirely)
- Creates new object (non-mutating)

### Path Resolution
- Home directory shortcuts (`~`) in SSH key paths are expanded using `os.homedir()`
- Relative paths are kept as-is (resolved by SSH client)
- Example: `~/.ssh/id_rsa` → `/home/username/.ssh/id_rsa`

### Error Handling
- File parse errors log to console but don't crash (continues to next path)
- Missing config files are ignored (no error if none found)
- Validation errors throw and prevent app startup
- Env vars with invalid types are parsed (parseInt, "true" string check)

## Common Tasks

### Load Configuration at Startup
```typescript
// In index.ts or main entry point
import { loadConfig } from './config/index';

const config = loadConfig();
console.log(`Starting server on ${config.server.host}:${config.server.port}`);
```

### Get Host Config for SSH Connection
```typescript
import { getHostConfig } from './config/hosts';

const hostConfig = getHostConfig('prod-server');
if (!hostConfig) {
  throw new Error('Host not configured');
}
// Use hostConfig for SSH connection
```

### Enable Authentication at Runtime
```typescript
import { loadConfig, reloadConfig } from './config/index';

// Update config/config.json
// Then reload
const newConfig = reloadConfig();
if (newConfig.auth.enabled) {
  console.log('Auth enabled');
}
```

### Override Port via Environment
```bash
# Start with custom port
PORT=8080 npm start

# Or in .env
PORT=8080
AUTH_ENABLED=true
```

### Add New Host Configuration
1. Edit `config/hosts.json`
2. Add new entry to `hosts` array with unique `id`
3. Use `getHostConfig(id)` to retrieve in application code

## Dependencies

- **fs** - File system operations (readFileSync, existsSync)
- **path** - Path utilities (join, homedir)
- **os** - OS utilities (homedir)

No external npm dependencies in config module.

## For AI Agents

### Session Manager Integration Points

**Config is read at startup:**
```typescript
// In index.ts
const config = loadConfig();
const server = fastify();
await server.listen({ port: config.server.port, host: config.server.host });
```

**Hosts accessed during SSH connections:**
```typescript
// In SSHConnectionManager.ts
const hostConfig = getHostConfig(sessionId.split(':')[0]);
const sshConfig = await sshConnectionManager.buildSSHConfig(hostConfig);
```

**Auth checked on protected routes:**
```typescript
// In middleware/auth.ts
const appConfig = getConfig();
if (appConfig.auth.enabled) {
  // Verify JWT token
}
```

### Common Modification Patterns

**To add new configuration option:**
1. Add property to `AppConfig` interface
2. Add default value to `DEFAULT_CONFIG`
3. Add env var load logic in `loadEnvConfig()`
4. Add validation in `validateConfig()` if constrained

**To add new host:**
1. Edit `config/hosts.json` and add entry
2. Set `id` field (unique identifier)
3. Configure auth (key, password, or agent)
4. Optional: add `jumpHost` for bastion connections

**To test configuration:**
```bash
# Verify config loads correctly
node -e "const config = require('./src/config').loadConfig(); console.log(JSON.stringify(config, null, 2))"

# Check hosts
node -e "const hosts = require('./src/config/hosts').getAllHosts(); console.log(hosts)"
```

## Testing Checklist

- [ ] Default config loads without file
- [ ] File config overrides defaults
- [ ] Environment variables override file config
- [ ] Validation rejects invalid port numbers
- [ ] Validation rejects discovery interval < 500ms
- [ ] Validation requires auth secret when auth enabled
- [ ] Caching works: `getConfig()` returns same object reference
- [ ] `reloadConfig()` clears cache and reloads
- [ ] Home directory paths resolved in host config
- [ ] Missing host config returns empty array
- [ ] `getHostConfig(id)` finds correct host
- [ ] Console logs show config source (file path)
- [ ] Invalid JSON in config file is logged and ignored
- [ ] Auth password hash is accepted when enabled

## Notes

- Configuration is immutable after load (no mutations after cache)
- File config takes precedence over defaults but loses to env vars
- SSH host discovery happens automatically after hosts are loaded
- Missing config files are silently ignored; defaults provide full coverage
- The config module itself has no npm dependencies (pure Node.js)
