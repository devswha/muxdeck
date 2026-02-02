import { useState } from 'react';
import { Session } from '../types/Session';
import { hideSession } from '../services/SessionService';

interface SessionTileProps {
  session: Session;
  isSelected: boolean;
  onSelect: (session: Session) => void;
  onViewTerminal?: (session: Session) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (sessionId: string) => void;
  onCloseSession?: (sessionId: string) => void;
  isPreviewCollapsed?: boolean;
  onTogglePreviewCollapse?: (sessionId: string) => void;
  children?: React.ReactNode;
  onDragStart?: () => void;
  isDragging?: boolean;
}

export function SessionTile({
  session,
  isSelected,
  onSelect,
  onViewTerminal,
  isFavorite = false,
  onToggleFavorite,
  onCloseSession,
  isPreviewCollapsed = true,
  onTogglePreviewCollapse,
  children,
  onDragStart,
  isDragging = false
}: SessionTileProps) {
  const [showCloseOptions, setShowCloseOptions] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  const handleViewTerminal = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewTerminal?.(session);
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(session.id);
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCloseOptions(true);
  };

  const handleHideSession = async () => {
    setIsHiding(true);
    try {
      await hideSession(session.id);
    } catch (error) {
      console.error('Failed to hide session:', error);
    } finally {
      setIsHiding(false);
      setShowCloseOptions(false);
    }
  };

  const handleTerminateSession = async () => {
    setIsClosing(true);
    try {
      await onCloseSession?.(session.id);
    } finally {
      setIsClosing(false);
      setShowCloseOptions(false);
    }
  };

  const handleTogglePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePreviewCollapse?.(session.id);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', session.id);
    onDragStart?.();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.status !== 'terminated' && onViewTerminal) {
      onViewTerminal(session);
    }
  };

  return (
    <div
      draggable={session.status !== 'terminated'}
      onDragStart={handleDragStart}
      data-testid={`session-tile-${session.id}`}
      data-session-name={session.name}
      className={`
        flex flex-col rounded-lg border overflow-hidden relative group
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-gray-700'}
        ${session.status === 'terminated' ? 'opacity-50' : ''}
        ${isDragging ? 'opacity-40 cursor-grabbing' : 'cursor-grab'}
      `}
      onClick={() => onSelect(session)}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onTogglePreviewCollapse && (
            <button
              onClick={handleTogglePreview}
              className="flex-shrink-0 text-gray-400 hover:text-gray-300 transition-colors"
              title={isPreviewCollapsed ? 'Expand preview' : 'Collapse preview'}
            >
              {isPreviewCollapsed ? '▶' : '▼'}
            </button>
          )}
          {onToggleFavorite && (
            <button
              onClick={handleToggleFavorite}
              className={`flex-shrink-0 transition-colors ${
                isFavorite
                  ? 'text-yellow-400 hover:text-yellow-300'
                  : 'text-gray-500 hover:text-yellow-400'
              }`}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorite ? '★' : '☆'}
            </button>
          )}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            session.status === 'active' ? 'bg-green-500' :
            session.status === 'idle' ? 'bg-yellow-500' :
            session.status === 'disconnected' ? 'bg-red-500' :
            'bg-gray-500'
          }`} />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-base font-semibold text-white truncate" title={session.name}>{session.name}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">{session.host.displayName}</span>
              {session.isClaudeSession && (
                <span className="px-1 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded">
                  Claude
                </span>
              )}
              {session.isClaudeSession && session.claudeStatus && (
                <span className={`px-1 py-0.5 text-[10px] rounded ${
                  session.claudeStatus === 'thinking'
                    ? 'bg-blue-500/20 text-blue-400 animate-pulse'
                    : session.claudeStatus === 'waiting_for_input'
                    ? 'bg-green-500/20 text-green-400'
                    : session.claudeStatus === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {session.claudeStatus === 'thinking' && 'Working...'}
                  {session.claudeStatus === 'waiting_for_input' && 'Ready'}
                  {session.claudeStatus === 'error' && 'Error'}
                  {session.claudeStatus === 'idle' && 'Idle'}
                </span>
              )}
            </div>
            {(() => {
              // Different preview logic for Claude vs non-Claude sessions
              const preview = session.isClaudeSession
                ? (session.userLastInput || session.conversationSummary || session.lastOutput)
                : (session.process.currentCommand || session.lastOutput);

              if (!preview) return null;

              return (
                <div className="mt-1 text-xs text-gray-500 truncate font-mono" title={preview}>
                  {session.isClaudeSession && session.userLastInput && (
                    <span className="text-blue-400 mr-1">›</span>
                  )}
                  {!session.isClaudeSession && session.process.currentCommand && (
                    <span className="text-green-400 mr-1">$</span>
                  )}
                  {preview}
                </div>
              );
            })()}
          </div>
          {session.status === 'terminated' && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-500/20 text-gray-400 rounded flex-shrink-0">
              Ended
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
          {onViewTerminal && session.status !== 'terminated' && (
            <button
              onClick={handleViewTerminal}
              className="p-1 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
              title="View Terminal"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          {(onCloseSession || true) && session.status !== 'terminated' && (
            <button
              onClick={handleCloseClick}
              disabled={isClosing}
              className="p-1 hover:bg-red-900/50 hover:text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Close session"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {!isPreviewCollapsed && (
        <div className="flex-1 bg-gray-900 min-h-[150px]">
          {children}
        </div>
      )}

      {showCloseOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCloseOptions(false)} />
          <div className="relative bg-gray-800 rounded-lg shadow-xl border border-gray-700 max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-2">Close Session</h2>
              <p className="text-gray-400 text-sm mb-5">'{session.name}'</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleHideSession}
                  disabled={isHiding}
                  className="w-full px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-left disabled:opacity-50"
                >
                  <div className="font-medium text-white">Hide from workspace</div>
                  <div className="text-xs text-gray-400 mt-1">Session keeps running in background</div>
                </button>
                <button
                  onClick={handleTerminateSession}
                  disabled={isClosing}
                  className="w-full px-4 py-3 rounded-lg bg-red-900/50 hover:bg-red-800/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="font-medium text-red-400">Terminate session</div>
                  <div className="text-xs text-gray-400 mt-1">Kill tmux session permanently</div>
                </button>
                <button
                  onClick={() => setShowCloseOptions(false)}
                  className="w-full px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
