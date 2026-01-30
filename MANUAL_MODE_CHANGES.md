# Manual-Only Mode Implementation

## Summary
Changed Session Manager from auto-discovery mode to manual-only mode. Sessions are now only added to the list when the user explicitly creates or attaches them.

## Changes Made

### 1. SessionDiscoveryService (`src/services/SessionDiscoveryService.ts`)

**Added:**
- `managedSessions: Set<string>` - Tracks manually-added session IDs
- `getManagedSessions()` - Returns only managed sessions
- `addManagedSession(sessionId)` - Adds a session to managed list
- `removeManagedSession(sessionId)` - Removes a session from managed list
- `notifyListeners()` - Notifies listeners with only managed sessions
- `getAvailableSessions(hostId)` - On-demand discovery for "Attach Existing" dropdown (returns unmanaged sessions only)

**Modified:**
- `refresh()` - Now only notifies listeners about managed sessions, marks only managed sessions as terminated
- `getAvailableTmuxSessions()` - Replaced with `getAvailableSessions()` (async, filters out managed sessions)

### 2. SessionManager (`src/services/SessionManager.ts`)

**Modified:**
- `createSession()` - Now calls `addManagedSession()` after creating
- `attachSession()` - Now calls `addManagedSession()` after attaching
- `killSession()` - Now calls `removeManagedSession()` before killing
- `killPane()` - Now calls `removeManagedSession()` before killing

### 3. MessageHandler (`src/server/MessageHandler.ts`)

**Modified:**
- `handleConnection()` - Sends `getManagedSessions()` instead of `getSessions()`
- `handleListSessions()` - Returns `getManagedSessions()` instead of `getSessions()`

### 4. Application Startup (`src/server/app.ts`)

**Modified:**
- `startServer()` - Commented out `sessionDiscoveryService.startPolling()` - auto-polling disabled

### 5. Session API Routes (`src/api/sessions.ts`)

**Modified:**
- `GET /api/sessions` - Returns `getManagedSessions()` instead of `getSessions()`
- `GET /api/sessions/available` - Now async, calls `getAvailableSessions()` instead of `getAvailableTmuxSessions()`

## Behavior Changes

### Before (Auto-Discovery Mode)
- Service polled tmux every 2 seconds
- All Claude sessions automatically appeared in the list
- WebSocket broadcast session updates on every discovery cycle

### After (Manual-Only Mode)
- No automatic polling on startup
- Sessions only added when user clicks "Create New" or "Attach Existing"
- Sessions stay in list until user closes them or they terminate
- "Attach Existing" dropdown performs on-demand discovery (shows only unmanaged sessions)

## API Behavior

### `/api/sessions` (GET)
- **Before**: Returned all discovered sessions
- **After**: Returns only manually-added (managed) sessions

### `/api/sessions/available` (GET)
- **Before**: Returned all tmux sessions for a host (sync)
- **After**: Performs on-demand discovery, returns only sessions NOT yet managed (async)

### `/api/sessions` (POST - Create)
- Automatically adds new session to managed list

### `/api/sessions/attach` (POST)
- Automatically adds attached session to managed list

### `/api/sessions/:id` (DELETE)
- Automatically removes session from managed list

## Frontend Impact

**No frontend changes required** - the frontend continues to:
- Call `GET /api/sessions` to get the list (now returns managed sessions only)
- Call `GET /api/sessions/available?hostId=X` for attach dropdown (now returns unmanaged sessions only)
- Call `POST /api/sessions` to create (backend handles adding to managed list)
- Call `POST /api/sessions/attach` to attach (backend handles adding to managed list)
- Call `DELETE /api/sessions/:id` to close (backend handles removing from managed list)

## Testing

Both backend and frontend build successfully:
- Backend: `npm run build` ✓
- Frontend: `cd frontend && npm run build` ✓

## Files Modified

1. `/home/devswha/workspace/session-manager/src/services/SessionDiscoveryService.ts`
2. `/home/devswha/workspace/session-manager/src/services/SessionManager.ts`
3. `/home/devswha/workspace/session-manager/src/server/MessageHandler.ts`
4. `/home/devswha/workspace/session-manager/src/server/app.ts`
5. `/home/devswha/workspace/session-manager/src/api/sessions.ts`
