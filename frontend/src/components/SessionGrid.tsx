import { useMemo } from 'react';
import { Session } from '../types/Session';
import { SessionTile } from './SessionTile';

interface SessionGridProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onViewTerminal?: (session: Session) => void;
  renderTerminal: (session: Session) => React.ReactNode;
  isFavorite?: (sessionId: string) => boolean;
  onToggleFavorite?: (sessionId: string) => void;
  onCloseSession?: (sessionId: string) => void;
  onSessionDrop?: (sessionId: string, workspaceId: null) => void;
  isDragOver?: boolean;
}

export function SessionGrid({
  sessions,
  selectedSessionId,
  onSelectSession,
  onViewTerminal,
  renderTerminal,
  isFavorite,
  onToggleFavorite,
  onCloseSession,
  onSessionDrop,
  isDragOver = false,
}: SessionGridProps) {
  // Sort sessions: favorites first, then by last activity
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aFav = isFavorite?.(a.id) ? 1 : 0;
      const bFav = isFavorite?.(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });
  }, [sessions, isFavorite]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const sessionId = e.dataTransfer.getData('text/plain');
    if (sessionId && onSessionDrop) {
      onSessionDrop(sessionId, null);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No sessions found</p>
          <p className="text-sm">Start a Claude session in tmux to see it here</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 min-h-[200px] transition-colors ${
        isDragOver ? 'bg-blue-900/20 border-2 border-blue-500 border-dashed rounded-lg' : ''
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {sortedSessions.map(session => (
        <SessionTile
          key={session.id}
          session={session}
          isSelected={session.id === selectedSessionId}
          onSelect={onSelectSession}
          onViewTerminal={onViewTerminal}
          isFavorite={isFavorite?.(session.id)}
          onToggleFavorite={onToggleFavorite}
          onCloseSession={onCloseSession}
        >
          {renderTerminal(session)}
        </SessionTile>
      ))}
      {sessions.length === 0 && isDragOver && (
        <div className="col-span-full flex items-center justify-center text-blue-400 text-sm">
          Drop here to remove from workspace
        </div>
      )}
    </div>
  );
}
