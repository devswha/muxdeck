import { useState, useCallback } from 'react';

export function useDragAndDrop() {
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dragOverWorkspaceId, setDragOverWorkspaceId] = useState<string | null>(null);

  const handleDragStart = useCallback((sessionId: string) => {
    setDraggingSessionId(sessionId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingSessionId(null);
    setDragOverWorkspaceId(null);
  }, []);

  const handleDragEnter = useCallback((workspaceId: string | null) => {
    setDragOverWorkspaceId(workspaceId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverWorkspaceId(null);
  }, []);

  return {
    draggingSessionId,
    dragOverWorkspaceId,
    handleDragStart,
    handleDragEnd,
    handleDragEnter,
    handleDragLeave,
  };
}
