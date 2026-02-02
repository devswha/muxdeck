<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# src/api

REST API route handlers for the Fastify server. Each file exports an async function that registers routes with the Fastify app instance.

## Purpose

Provides HTTP endpoints for all client operations:
- **Session Management**: Discover, create, attach, and manage tmux sessions
- **Workspace Organization**: CRUD operations for workspace containers
- **Host Configuration**: SSH host setup and connection testing
- **Todo Tracking**: Workspace-scoped todo items
- **Feature Backlog**: Development backlog with priority and status tracking
- **Authentication**: JWT-based login and token refresh

## Architecture Pattern

All route files follow a consistent pattern:

```typescript
export async function {resource}Routes(app: FastifyInstance) {
  // GET endpoint
  app.get('/api/{resource}', async (request, reply) => { ... });

  // POST endpoint (create)
  app.post<{ Body: CreateRequest }>('/api/{resource}', {
    schema: { /* validation */ }
  }, async (request, reply) => { ... });

  // PUT endpoint (update)
  app.put('/api/{resource}/:id', async (request, reply) => { ... });

  // DELETE endpoint
  app.delete('/api/{resource}/:id', async (request, reply) => { ... });
}
```

Each route is registered in `server/app.ts` via:
```typescript
import { sessionRoutes } from './api/sessions.js';
await sessionRoutes(app);
```

## File Reference

### sessions.ts

Manages Claude sessions and tmux session lifecycle.

**Exports**: `sessionRoutes(app: FastifyInstance)`

**Dependencies**:
- `SessionManager` - Creates and terminates tmux sessions
- `SessionDiscoveryService` - Discovers and tracks sessions
- `WorkspaceStorage` - Validates workspace existence

**Endpoints**:

| Method | Path | Purpose | Status Codes |
|--------|------|---------|--------------|
| GET | `/api/sessions` | List managed sessions, filter Claude sessions | 200 |
| GET | `/api/sessions/available` | Get available tmux sessions on host (for attach dropdown) | 200, 400 |
| GET | `/api/sessions/:id` | Fetch single session details | 200, 404 |
| POST | `/api/sessions` | Create new tmux session with Claude | 201, 400 |
| POST | `/api/sessions/attach` | Register existing tmux session as managed | 200, 400 |
| DELETE | `/api/sessions/:id` | Kill tmux session | 204, 404, 500 |
| PUT | `/api/sessions/:id/workspace` | Reassign session to workspace | 200, 400, 404, 500 |
| POST | `/api/sessions/:id/hide` | Hide session from UI (don't delete tmux) | 204, 400, 404, 500 |

**Key Request/Response Types**:

```typescript
// GET /api/sessions?claudeOnly=false
{
  "sessions": [
    {
      "id": "local:$0:0",
      "name": "my-session",
      "host": { "id": "local", "type": "local", "displayName": "Local" },
      "status": "active",
      "isClaudeSession": true,
      "workspaceId": "uuid-1234",
      "createdAt": "2026-02-01T10:00:00Z",
      "lastActivityAt": "2026-02-01T10:30:00Z",
      "lastOutput": "Processing input...",
      "userLastInput": "❯ what files are in this dir"
    }
  ]
}

// POST /api/sessions
{
  "workingDirectory": "/home/user/project",
  "hostId": "local",
  "sessionName": "dev-session",
  "claudeArgs": ["--no-confirm"],
  "workspaceId": "uuid-1234"
}
// Returns: 201 { "session": { ... } }

// POST /api/sessions/attach
{
  "sessionName": "existing-session",
  "hostId": "remote-server",
  "workspaceId": "uuid-1234"
}
// Returns: 200 { "session": { ... } }

// PUT /api/sessions/:id/workspace
{
  "workspaceId": "new-uuid" // or null to unassign
}
// Returns: 200 { "session": { ... } }
```

**Query Parameters**:
- `claudeOnly` (GET /api/sessions): Default `true`. Set to `false` to include all tmux sessions, not just Claude sessions.
- `hostId` (GET /api/sessions/available): Required. Host ID to discover sessions on.

**Validation**:
- Session name: alphanumeric + underscore + hyphen (`[a-zA-Z0-9_-]+`)
- Working directory: non-empty string
- Host ID: non-empty string

**Error Cases**:
```
GET /api/sessions/:id (not found)
404 { "error": "Session not found" }

POST /api/sessions (invalid input)
400 { "error": "Session name must match pattern..." }

DELETE /api/sessions/:id (tmux error)
500 { "error": "Unable to kill session: ..." }

PUT /api/sessions/:id/workspace (workspace not found)
404 { "error": "Workspace not found" }
```

---

### workspaces.ts

Manages workspace containers for organizing sessions and todos.

**Exports**: `workspaceRoutes(app: FastifyInstance)`

**Dependencies**:
- `WorkspaceStorage` - File-based persistence
- `SessionDiscoveryService` - Updates session workspace mappings

**Endpoints**:

| Method | Path | Purpose | Status Codes |
|--------|------|---------|--------------|
| GET | `/api/workspaces` | List all workspaces | 200, 500 |
| GET | `/api/workspaces/:id` | Fetch single workspace | 200, 404, 500 |
| POST | `/api/workspaces` | Create new workspace | 201, 400 |
| PUT | `/api/workspaces/:id` | Update workspace metadata | 200, 400, 404 |
| DELETE | `/api/workspaces/:id` | Delete workspace, reassign sessions to null | 200, 404, 500 |

**Key Request/Response Types**:

```typescript
// GET /api/workspaces
{
  "workspaces": [
    {
      "id": "uuid-1234",
      "name": "Frontend Team",
      "description": "React/TypeScript components",
      "hidden": false,
      "createdAt": "2026-01-15T09:00:00Z",
      "updatedAt": "2026-02-01T10:00:00Z"
    }
  ]
}

// POST /api/workspaces
{
  "name": "Backend Development",
  "description": "Node.js API services"
}
// Returns: 201 { "workspace": { ... } }

// PUT /api/workspaces/:id
{
  "name": "Updated Name",
  "description": "Updated description",
  "hidden": true
}
// Returns: 200 { "workspace": { ... } }

// DELETE /api/workspaces/:id
// Returns: 200 { "success": true, "movedSessions": 5 }
```

**Validation**:
- Name: required, max 50 characters
- Description: optional, no length limit
- Hidden: optional boolean

**Special Behavior**:
- On DELETE: All sessions in the workspace are automatically reassigned to `workspaceId: null`
- Name uniqueness is not enforced (multiple workspaces can have same name)

**Error Cases**:
```
POST /api/workspaces (name too long)
400 { "error": "Name must be 50 characters or less" }

PUT /api/workspaces/:id (invalid name)
400 { "error": "Name must be 50 characters or less" }

GET /api/workspaces/:id (not found)
404 { "error": "Workspace not found" }
```

---

### hosts.ts

Manages SSH host configuration and connection testing.

**Exports**: `hostRoutes(app: FastifyInstance)`

**Dependencies**:
- `HostConfigService` - SSH host persistence and validation
- `getAllHosts()` - Load configured hosts from config

**Endpoints**:

| Method | Path | Purpose | Status Codes |
|--------|------|---------|--------------|
| GET | `/api/hosts` | List all configured hosts (includes local) | 200 |
| POST | `/api/hosts` | Add new SSH host configuration | 200, 400 |
| PUT | `/api/hosts/:id` | Update SSH host configuration | 200, 400 |
| DELETE | `/api/hosts/:id` | Remove SSH host | 200, 400 |
| POST | `/api/hosts/test` | Test SSH connection with credentials | 200, 500 |

**Key Request/Response Types**:

```typescript
// GET /api/hosts
{
  "hosts": [
    {
      "id": "local",
      "name": "Local",
      "type": "local",
      "connected": true
    },
    {
      "id": "prod-server",
      "name": "Production",
      "type": "ssh",
      "hostname": "prod.example.com",
      "port": 22,
      "username": "ubuntu",
      "privateKeyPath": "/home/user/.ssh/id_rsa",
      "password": undefined,
      "useAgent": true,
      "passphraseEnvVar": "SSH_KEY_PASSPHRASE",
      "jumpHost": {
        "hostname": "bastion.example.com",
        "port": 22,
        "username": "bastion-user"
      }
    }
  ]
}

// POST /api/hosts
{
  "id": "staging-server",
  "name": "Staging",
  "hostname": "staging.example.com",
  "port": 22,
  "username": "ubuntu",
  "privateKeyPath": "/home/user/.ssh/staging_key",
  "password": undefined,
  "useAgent": false,
  "passphraseEnvVar": "STAGING_PASSPHRASE",
  "jumpHost": {
    "hostname": "jump.example.com",
    "port": 22,
    "username": "jump-user",
    "privateKeyPath": "/home/user/.ssh/jump_key"
  }
}
// Returns: 200 { "success": true, "message": "Host added successfully" }

// POST /api/hosts/test
{
  "hostname": "test.example.com",
  "port": 22,
  "username": "user",
  "privateKeyPath": "/path/to/key",
  "password": undefined,
  "useAgent": true,
  "jumpHost": null
}
// Returns: 200 { "success": true } or 500 { "success": false, "error": "..." }

// PUT /api/hosts/:id
{
  "name": "Updated Name",
  "port": 2222
}
// Returns: 200 { "success": true, "message": "Host updated successfully" }
```

**Host Configuration Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique host identifier |
| `name` | string | Yes | Display name |
| `hostname` | string | Yes | SSH hostname or IP |
| `port` | number | No | SSH port (default: 22) |
| `username` | string | Yes | SSH username |
| `privateKeyPath` | string | No | Path to private key file |
| `password` | string | No | Plain password (avoid storing) |
| `useAgent` | boolean | No | Use SSH_AUTH_SOCK for key agent |
| `passphraseEnvVar` | string | No | Environment variable for key passphrase |
| `jumpHost` | object | No | Jump host config (same fields as parent) |

**Authentication Priority** (tested in order):
1. Password (if `password` set or `passwordEnvVar` env var exists)
2. Private key with `privateKeyPath`
3. SSH agent (if `useAgent: true`)
4. Default ssh-agent

**Error Cases**:
```
POST /api/hosts (invalid hostname)
400 { "success": false, "error": "Invalid hostname" }

PUT /api/hosts/:id (connection error during update)
400 { "success": false, "error": "Failed to validate host credentials" }

POST /api/hosts/test (connection timeout)
500 { "success": false, "error": "Connection timeout after 10s" }
```

---

### todos.ts

Manages todo items within workspaces.

**Exports**: `todoRoutes(app: FastifyInstance)`

**Dependencies**:
- `TodoStorage` - File-based persistence of todo items

**Endpoints**:

| Method | Path | Purpose | Status Codes |
|--------|------|---------|--------------|
| GET | `/api/workspaces/:workspaceId/todos` | List todos in workspace | 200, 500 |
| POST | `/api/workspaces/:workspaceId/todos` | Create new todo | 201, 400 |
| PUT | `/api/workspaces/:workspaceId/todos/:todoId` | Update todo text or completion status | 200, 400, 404 |
| DELETE | `/api/workspaces/:workspaceId/todos/:todoId` | Delete todo | 200, 404, 500 |

**Key Request/Response Types**:

```typescript
// GET /api/workspaces/:workspaceId/todos
{
  "todos": [
    {
      "id": "todo-uuid-1",
      "workspaceId": "workspace-uuid-1",
      "text": "Review pull request",
      "completed": false,
      "createdAt": "2026-02-01T09:00:00Z",
      "updatedAt": "2026-02-01T09:30:00Z"
    },
    {
      "id": "todo-uuid-2",
      "workspaceId": "workspace-uuid-1",
      "text": "Deploy to staging",
      "completed": true,
      "createdAt": "2026-01-28T10:00:00Z",
      "updatedAt": "2026-02-01T14:00:00Z"
    }
  ]
}

// POST /api/workspaces/:workspaceId/todos
{
  "text": "Implement new feature"
}
// Returns: 201 { "todo": { ... } }

// PUT /api/workspaces/:workspaceId/todos/:todoId
{
  "text": "Updated description",
  "completed": true
}
// Returns: 200 { "todo": { ... } }

// DELETE /api/workspaces/:workspaceId/todos/:todoId
// Returns: 200 { "success": true }
```

**Validation**:
- Text: required, non-empty, whitespace trimmed
- Completed: optional boolean
- WorkspaceId: extracted from URL path

**Error Cases**:
```
POST /api/workspaces/:workspaceId/todos (empty text)
400 { "error": "Text is required and cannot be empty" }

PUT /api/workspaces/:workspaceId/todos/:todoId (invalid text)
400 { "error": "Text cannot be empty" }

PUT /api/workspaces/:workspaceId/todos/:todoId (not found)
404 { "error": "Todo not found" }
```

---

### backlog.ts

Manages feature backlog with priority, type, and status tracking.

**Exports**: `backlogRoutes(app: FastifyInstance)`

**Dependencies**:
- `BacklogService` - In-memory or file-based backlog persistence

**Endpoints**:

| Method | Path | Purpose | Status Codes |
|--------|------|---------|--------------|
| GET | `/api/backlog` | List backlog items, optional status filter | 200 |
| GET | `/api/backlog/stats` | Get backlog statistics | 200 |
| GET | `/api/backlog/export` | Export backlog as markdown | 200 |
| GET | `/api/backlog/:id` | Fetch single backlog item | 200, 404 |
| POST | `/api/backlog` | Create new backlog item | 201 |
| PUT | `/api/backlog/:id` | Update backlog item | 200, 404 |
| DELETE | `/api/backlog/:id` | Delete backlog item | 200, 404 |

**Key Request/Response Types**:

```typescript
// GET /api/backlog?status=in_progress
{
  "items": [
    {
      "id": "backlog-uuid-1",
      "type": "feature",
      "title": "Add password auth for SSH hosts",
      "description": "Support password-based SSH authentication",
      "priority": "high",
      "status": "in_progress",
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-02-01T14:00:00Z"
    }
  ]
}

// GET /api/backlog/stats
{
  "total": 15,
  "byStatus": {
    "pending": 8,
    "in_progress": 4,
    "done": 3
  },
  "byPriority": {
    "low": 2,
    "medium": 6,
    "high": 7
  },
  "byType": {
    "feature": 8,
    "bug": 4,
    "improvement": 3
  }
}

// GET /api/backlog/export
{
  "markdown": "# Backlog\n\n## High Priority\n- [ ] Feature 1\n- [x] Feature 2\n..."
}

// POST /api/backlog
{
  "type": "bug",
  "title": "Terminal output not streaming",
  "description": "WebSocket messages arriving out of order",
  "priority": "high"
}
// Returns: 201 { ... backlog item ... }

// PUT /api/backlog/:id
{
  "status": "done",
  "priority": "medium"
}
// Returns: 200 { ... updated backlog item ... }
```

**Backlog Item Types**:
- `feature` - New functionality
- `bug` - Defect or issue
- `improvement` - Enhancement to existing feature

**Backlog Priorities**:
- `low` - Nice-to-have
- `medium` - Should implement
- `high` - Critical/blocking

**Backlog Statuses**:
- `pending` - Not started
- `in_progress` - Currently being worked on
- `done` - Completed

**Query Parameters**:
- `status` (GET /api/backlog): Optional. Filter by status (`pending`, `in_progress`, or `done`). If omitted, returns all items.

**Error Cases**:
```
GET /api/backlog/:id (not found)
404 { "error": "Backlog item not found" }

PUT /api/backlog/:id (not found)
404 { "error": "Backlog item not found" }

DELETE /api/backlog/:id (not found)
404 { "error": "Backlog item not found" }
```

---

### auth.ts

Handles JWT-based authentication and token management.

**Exports**: `authRoutes(app: FastifyInstance)`

**Dependencies**:
- `AuthService` - JWT generation, verification, and password validation

**Endpoints**:

| Method | Path | Purpose | Status Codes |
|--------|------|---------|--------------|
| POST | `/api/auth/login` | Authenticate with username/password, get JWT | 200, 401 |
| POST | `/api/auth/refresh` | Refresh expiring JWT token | 200, 401 |
| GET | `/api/auth/status` | Check if auth is enabled and current user | 200 |

**Key Request/Response Types**:

```typescript
// POST /api/auth/login
{
  "username": "admin",
  "password": "correct-password"
}
// Returns: 200
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}

// POST /api/auth/refresh
// Headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
// Returns: 200
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}

// GET /api/auth/status
// Returns: 200
{
  "enabled": true,
  "user": "admin"
}

// GET /api/auth/status (auth disabled)
// Returns: 200
{
  "enabled": false,
  "user": null
}
```

**Validation**:
- Username: required, non-empty
- Password: required, non-empty

**Authentication Behavior**:
- If `AUTH_ENABLED` environment variable is `false`, all endpoints return `enabled: false` and auth is not required
- If enabled, tokens are required in the `Authorization: Bearer <token>` header for protected routes
- Token expiry defaults to 24 hours (86400 seconds)

**Error Cases**:
```
POST /api/auth/login (invalid credentials)
401 { "error": "Invalid credentials" }

POST /api/auth/refresh (missing header)
401 { "error": "Missing authorization header" }

POST /api/auth/refresh (invalid token)
401 { "error": "Invalid token" }
```

---

## Common Patterns

### Schema Validation

Fastify schema validation is applied to POST/PUT requests:

```typescript
app.post<{ Body: CreateSessionRequest }>('/api/sessions', {
  schema: {
    body: {
      type: 'object',
      required: ['workingDirectory', 'hostId'],
      properties: {
        workingDirectory: { type: 'string', minLength: 1 },
        hostId: { type: 'string', minLength: 1 },
        sessionName: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
        claudeArgs: { type: 'array', items: { type: 'string' } },
        workspaceId: { type: 'string' }
      }
    }
  }
}, async (request, reply) => { ... });
```

**Benefits**:
- Automatic 400 response for invalid input
- Type-safe request body
- OpenAPI schema generation

### Error Handling Pattern

Standard response format for all errors:

```typescript
// Client error
reply.status(400);
return { error: 'Descriptive message' };

// Server error
reply.status(500);
return { error: 'Internal server error' };

// Success with data
return { session: {...}, success: true };
```

### Async Service Dependencies

Each route file imports singleton service instances:

```typescript
import { sessionManager } from '../services/SessionManager.js';
import { sessionDiscoveryService } from '../services/SessionDiscoveryService.js';

// These are shared instances across all requests
const session = await sessionManager.createSession(request.body);
```

---

## Integration Guide

### Adding a New Endpoint

1. **Define types** in `src/types/{resource}.ts`
   ```typescript
   export interface MyResource {
     id: string;
     name: string;
   }
   
   export interface CreateMyResourceRequest {
     name: string;
   }
   ```

2. **Create route handler** in `src/api/{resource}.ts`
   ```typescript
   export async function myResourceRoutes(app: FastifyInstance) {
     app.get('/api/myresources', async () => {
       return { items: [] };
     });
   }
   ```

3. **Register in** `src/server/app.ts`
   ```typescript
   import { myResourceRoutes } from '../api/myresources.js';
   await myResourceRoutes(app);
   ```

4. **Test with**
   ```bash
   curl http://localhost:3000/api/myresources
   ```

### Testing Routes Locally

```bash
# List sessions
curl http://localhost:3000/api/sessions

# Create session
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "workingDirectory": "/tmp",
    "hostId": "local",
    "sessionName": "test"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "secret"}'

# Use token for protected routes
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/sessions
```

---

## Related Documentation

- **Parent**: `../AGENTS.md` - Backend architecture overview
- **Services**: `../services/AGENTS.md` - Business logic and session management
- **Types**: `../types/` - TypeScript interfaces and enums
- **Server**: `../server/AGENTS.md` - HTTP and WebSocket setup

## Testing Checklist

- [ ] Session creation with valid working directory
- [ ] Workspace CRUD operations
- [ ] Host configuration validation and SSH testing
- [ ] Todo item creation and status updates
- [ ] Backlog item creation with priority/type
- [ ] Authentication login and token refresh
- [ ] Error responses for invalid input
- [ ] 404 responses for missing resources
- [ ] 400 responses for schema validation failures
