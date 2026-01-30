# Drag-and-Drop Integration Guide

## Overview
This guide shows how to integrate the drag-and-drop functionality into your parent component (e.g., App.tsx or a page component).

## Files Modified
- `SessionTile.tsx` - Added draggable support
- `WorkspaceGrid.tsx` - Added drop zone props
- `WorkspaceGroup.tsx` - Added drop zone handling
- `SessionGrid.tsx` - Added unassigned drop zone
- `grid.css` - Added drag-and-drop styles

## Files Created
- `hooks/useDragAndDrop.ts` - Hook for managing drag state
- `DragDropIntegrationGuide.md` - This file

## Integration Steps

### 1. Import Required Dependencies

```tsx
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { assignSessionToWorkspace } from './services/WorkspaceService';
import { Session } from './types/Session';
```

### 2. Add Drag State to Your Component

```tsx
function YourParentComponent() {
  const {
    draggingSessionId,
    dragOverWorkspaceId,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
  } = useDragAndDrop();

  // Your existing state...
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithSessions[]>([]);
```

### 3. Implement Session Drop Handler

```tsx
  const handleSessionDrop = async (sessionId: string, workspaceId: string | null) => {
    try {
      // Call API to update session workspace
      const updatedSession = await assignSessionToWorkspace(sessionId, workspaceId);

      // Update local state
      setSessions(prev =>
        prev.map(s => s.id === sessionId ? updatedSession : s)
      );

      // Refresh workspaces if needed
      // await refetchWorkspaces();

    } catch (error) {
      console.error('Failed to move session:', error);
      // Show error notification to user
    } finally {
      handleDragEnd();
    }
  };
```

### 4. Update WorkspaceGrid Usage

```tsx
  <WorkspaceGrid
    workspaces={workspaces}
    onToggleCollapse={handleToggleCollapse}
    onAddSession={handleAddSession}
    onDeleteWorkspace={handleDeleteWorkspace}
    renderSession={(session) => (
      <SessionTile
        session={session}
        isSelected={selectedSessionId === session.id}
        onSelect={handleSelectSession}
        onViewTerminal={handleViewTerminal}
        isFavorite={favorites.includes(session.id)}
        onToggleFavorite={handleToggleFavorite}
        onCloseSession={handleCloseSession}
        onDragStart={(session) => handleDragStart(session.id)}
        isDragging={draggingSessionId === session.id}
      >
        {renderTerminal(session)}
      </SessionTile>
    )}
    onSessionDrop={handleSessionDrop}
    dragOverWorkspaceId={dragOverWorkspaceId}
  />
```

### 5. Update SessionGrid Usage (for Unassigned Sessions)

```tsx
  <SessionGrid
    sessions={unassignedSessions}
    selectedSessionId={selectedSessionId}
    onSelectSession={handleSelectSession}
    onViewTerminal={handleViewTerminal}
    renderTerminal={renderTerminal}
    isFavorite={(id) => favorites.includes(id)}
    onToggleFavorite={handleToggleFavorite}
    onCloseSession={handleCloseSession}
    onSessionDrop={handleSessionDrop}
    isDragOver={dragOverWorkspaceId === null && draggingSessionId !== null}
  />
```

### 6. Add Global Drag End Handler

```tsx
  useEffect(() => {
    // Clean up drag state when drag ends anywhere
    const handleGlobalDragEnd = () => {
      handleDragEnd();
    };

    document.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, [handleDragEnd]);
```

## API Endpoint

The drag-and-drop uses the existing API endpoint:

```
PUT /api/sessions/:id/workspace
Body: { workspaceId: string | null }
```

- `workspaceId: string` - Assigns session to a workspace
- `workspaceId: null` - Removes session from workspace (moves to unassigned)

## Visual Feedback

The implementation provides the following visual feedback:

1. **Dragging Session**:
   - Session becomes semi-transparent (40% opacity)
   - Cursor changes to "grabbing"

2. **Drop Target Workspace**:
   - Header background changes to blue tint
   - Border highlights in blue
   - Session grid area shows blue background

3. **Drop Target Unassigned Area**:
   - Blue dashed border appears
   - Background tint applied
   - Helper text shown when empty

## Browser Compatibility

Uses native HTML5 Drag and Drop API:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ No external dependencies required

## Notes

- Only non-terminated sessions are draggable
- Drag state is automatically cleaned up on drag end
- Multiple sessions can be dragged sequentially
- No external drag-and-drop libraries needed
