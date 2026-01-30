import { useState } from 'react';
import { Session } from '../types/Session';
import { ConfirmDialog } from './ConfirmDialog';
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
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
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
    setShowCloseConfirm(true);
  };

  const handleConfirmClose = async () => {
    setIsClosing(true);
    try {
      await onCloseSession?.(session.id);
    } finally {
      setIsClosing(false);
      setShowCloseConfirm(false);
    }
  };

  const handleTogglePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePreviewCollapse?.(session.id);
  };

  const handleHideClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsHiding(true);
    try {
      await hideSession(session.id);
      // The session will be hidden and the UI will refresh from the parent
    } catch (error) {
      console.error('Failed to hide session:', error);
    } finally {
      setIsHiding(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', session.id);
    onDragStart?.();
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
            <span className="text-sm font-semibold text-white truncate" title={session.name}>{session.name}</span>
            <span className="text-xs text-gray-400">{session.host.displayName}</span>
          </div>
          {session.isClaudeSession && (
            <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded flex-shrink-0">
              Claude
            </span>
          )}
          {session.status === 'terminated' && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-500/20 text-gray-400 rounded flex-shrink-0">
              Ended
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0">
          {onViewTerminal && session.status !== 'terminated' && (
            <button
              onClick={handleViewTerminal}
              className="px-2 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
            >
              View Terminal
            </button>
          )}
          {session.status !== 'terminated' && (
            <button
              onClick={handleHideClick}
              disabled={isHiding}
              className="p-1 hover:bg-slate-700 hover:text-slate-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Hide from workspace"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </button>
          )}
          {onCloseSession && session.status !== 'terminated' && (
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

      <ConfirmDialog
        isOpen={showCloseConfirm}
        title="Close Session"
        message={`Are you sure you want to close session '${session.name}'? This will terminate the tmux session.`}
        confirmText="Close Session"
        cancelText="Cancel"
        danger={true}
        onConfirm={handleConfirmClose}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}
