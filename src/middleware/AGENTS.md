<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-01 | Updated: 2026-02-01 -->

# src/middleware

Request middleware for Fastify, providing cross-cutting concerns like authentication and authorization.

## Purpose

Implements middleware hooks that intercept HTTP requests before route handlers execute. Currently provides JWT-based authentication with configurable bypass rules for public endpoints.

## Architecture

```
Request Flow:
┌─────────────────────────────────────┐
│  Incoming HTTP Request              │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  authMiddleware (preHandler hook)   │
│  • Check if auth enabled            │
│  • Skip public paths                │
│  • Validate Authorization header    │
│  • Verify JWT token                 │
│  • Attach user to request           │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┐
      │             │
   ✓ Pass      ✗ Reject (401)
      │             │
      ▼             ▼
  Route Handler   Error Response
```

## Key Files

| File | Description |
|------|-------------|
| **auth.ts** | JWT authentication middleware; validates Bearer tokens from Authorization header; skips validation for login, health checks, and when auth is disabled |

## How It Works

### authMiddleware Function

**Signature:**
```typescript
async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void>
```

**Flow:**

1. **Check if auth is enabled** → `authService.isEnabled()`
   - If disabled, request passes through without validation
   - Controlled by environment variable `AUTH_ENABLED`

2. **Skip public paths** → Unauthenticated routes
   - `/api/auth/login` - Login endpoint (exchanges credentials for token)
   - `/health` - Health check endpoint (for load balancers, monitoring)

3. **Extract Authorization header** → Must be `Bearer <token>`
   - Format: `Authorization: Bearer eyJhbGc...`
   - If missing or invalid format → 401 response

4. **Extract token** → Substring from position 7 onward
   - Removes `Bearer ` prefix (7 characters)

5. **Verify JWT token** → `authService.verifyToken(token)`
   - Validates token signature against `AUTH_SECRET`
   - Checks token expiration (`AUTH_TOKEN_EXPIRY`)
   - Returns decoded payload (contains user info)
   - If invalid or expired → 401 response

6. **Attach user to request** → `request.user = payload`
   - Makes user information available to route handlers
   - Type assertion: `(request as any).user`

### extractTokenFromUrl Function

**Purpose:** Parse token from query parameter (for WebSocket fallback or testing)

**Signature:**
```typescript
function extractTokenFromUrl(url: string): string | null
```

**Usage:**
- Attempts to parse URL and extract `token` query parameter
- Returns null if URL is invalid or parameter missing
- Used as fallback for WebSocket connections that can't send headers

**Example:**
```
Input: "http://localhost:3000/ws?token=eyJhbGc..."
Output: "eyJhbGc..."
```

## Integration with Fastify

### Registration

Middleware is registered in `server/app.ts`:

```typescript
app.addHook('preHandler', authMiddleware);
```

- Executes **before** all route handlers
- Applies to **all routes** (unless route-specific hooks override)
- Async function allows database/service calls

### Error Responses

**401 Unauthorized - Missing/Invalid Header:**
```json
{
  "error": "Missing or invalid authorization header"
}
```

**401 Unauthorized - Invalid/Expired Token:**
```json
{
  "error": "Invalid or expired token"
}
```

## Authentication Flow

### Login Process

1. Client calls `POST /api/auth/login` with credentials
   - Endpoint skips authMiddleware (public route)
   - AuthService validates username/password hash
   - Returns JWT token (valid for 24 hours by default)

2. Client stores token in memory or localStorage

3. Client includes token in all subsequent requests
   ```
   Authorization: Bearer <token>
   ```

### Protected Request

1. Request arrives with `Authorization: Bearer <token>`
2. authMiddleware validates token
3. If valid, request.user populated with user info
4. Route handler executes with authenticated user context

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_ENABLED` | `false` | Enable/disable authentication |
| `AUTH_SECRET` | (required if AUTH_ENABLED=true) | Secret key for JWT signing |
| `AUTH_TOKEN_EXPIRY` | `86400` | Token lifetime in seconds (default: 24 hours) |
| `AUTH_USERNAME` | `admin` | Default username for login |
| `AUTH_PASSWORD_HASH` | (required if AUTH_ENABLED=true) | Bcrypt hash of password |

### Feature Flags

**Disable Authentication (Development)**
```bash
AUTH_ENABLED=false
```
All routes become public; user information unavailable in request context.

**Enable Authentication (Production)**
```bash
AUTH_ENABLED=true
AUTH_SECRET=super-secret-key-min-32-chars
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=$(npm run hash-password -- "your-password")
```

## Common Patterns

### Checking Authentication in Route Handlers

```typescript
// In a route handler
app.get('/api/protected', async (request: FastifyRequest, reply: FastifyReply) => {
  const user = (request as any).user;

  if (!user) {
    return reply.status(403).send({ error: 'Unauthorized' });
  }

  // User authenticated; proceed with business logic
  return { message: `Hello, ${user.username}` };
});
```

### Conditional Auth Based on Config

```typescript
// AuthService.isEnabled() returns boolean
if (authService.isEnabled()) {
  // Auth is mandatory; user MUST have valid token
} else {
  // Auth is optional; request.user may be undefined
}
```

### Token Generation in AuthService

```typescript
const token = authService.generateToken({ username: 'admin' });
// Token expires in AUTH_TOKEN_EXPIRY seconds
// Signature validated with AUTH_SECRET
```

## Testing

### Manual Testing

**Test without auth (AUTH_ENABLED=false):**
```bash
curl http://localhost:3000/api/sessions
# ✓ Works without Authorization header
```

**Test with auth (AUTH_ENABLED=true):**
```bash
# 1. Get token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}' \
  | jq -r .token)

# 2. Use token in request
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer $TOKEN"
# ✓ Works with valid token

# 3. Test without token
curl http://localhost:3000/api/sessions
# ✗ 401 Unauthorized
```

**Test public endpoints:**
```bash
# Health check (always public)
curl http://localhost:3000/health
# ✓ Works regardless of AUTH_ENABLED

# Login endpoint (always public)
curl -X POST http://localhost:3000/api/auth/login
# ✓ Works regardless of AUTH_ENABLED
```

## Type Safety

### Request User Type

Currently uses type assertion:
```typescript
(request as any).user = payload;
```

**Better approach** (type-safe):
```typescript
// In types/index.ts
declare global {
  namespace FastifyInstance {
    interface FastifyRequest {
      user?: JwtPayload;
    }
  }
}

// In middleware
request.user = payload;  // No type assertion needed
```

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 on all requests | `AUTH_ENABLED=true` but no Authorization header sent | Client must send `Authorization: Bearer <token>` |
| Token rejected immediately | Token expired or invalid signature | Regenerate token via login endpoint |
| Cannot test without token | Auth enabled but need public access | Set `AUTH_ENABLED=false` for development |
| Header case sensitivity | HTTP headers are case-insensitive but code checks exact format | Use `Authorization` (capital A) in client requests |
| WebSocket auth fails | WebSocket can't send custom headers | Use `extractTokenFromUrl()` to parse `?token=` query param |

## Dependencies

- **Fastify** - HTTP framework providing preHandler hook
- **authService** - JWT token generation/verification (from `services/AuthService`)

## Future Enhancements

1. **Role-Based Access Control (RBAC)**
   - Extend `request.user` with roles array
   - Add route-level authorization decorators

2. **Token Refresh**
   - Implement refresh token endpoint
   - Allow tokens to be renewed without login

3. **Rate Limiting**
   - Add middleware to throttle login attempts
   - Prevent brute-force attacks

4. **Audit Logging**
   - Log authentication failures
   - Track user actions with timestamps

5. **WebSocket Auth**
   - Extend authMiddleware for WebSocket upgrades
   - Validate token before establishing WS connection

6. **Type-Safe Request Extension**
   - Define Fastify module augmentation for request.user
   - Remove type assertions

## For AI Agents

### Quick Reference

**To protect a new endpoint:**
1. Route handler receives `FastifyRequest` with potential `user` property
2. If `AUTH_ENABLED=true`, authMiddleware runs first
3. If token invalid, request never reaches handler (401 response)
4. If token valid, `request.user` contains decoded JWT payload

**To add a public endpoint:**
1. Add route URL to skip list in authMiddleware
2. Route executes regardless of AUTH_ENABLED
3. Request context may not have user info

**To test authentication:**
1. Set `AUTH_ENABLED=true` and provide credentials
2. Login via `/api/auth/login` to get token
3. Include token in `Authorization: Bearer <token>` header
4. Verify protected endpoint returns 200 (not 401)

### Common Tasks

**Add a new protected endpoint:**
```typescript
// In api/myroute.ts
app.get('/api/myroute', async (request, reply) => {
  // authMiddleware already validated token
  const user = (request as any).user;
  return { authenticated: !!user };
});

// Middleware runs automatically; no additional code needed
```

**Make an endpoint public:**
```typescript
// In middleware/auth.ts - add URL to skip list
if (request.url === '/api/myroute') {
  return;
}
```

**Check if user is authenticated in handler:**
```typescript
const user = (request as any).user;
if (user) {
  // Authenticated
} else {
  // Not authenticated (only if AUTH_ENABLED=false)
}
```

## MANUAL:

This documentation describes the authentication middleware layer. For updates:
1. Verify skip paths match current public endpoints
2. Check AuthService integration remains unchanged
3. Review error messages for clarity
4. Test with both AUTH_ENABLED states
5. Validate type safety improvements
