import { Session } from '../types/Session';

interface SessionHeaderProps {
  session: Session;
  onClose?: () => void;
  onMaximize?: () => void;
  isMaximized?: boolean;
}

export function SessionHeader({ session, onClose, onMaximize, isMaximized }: SessionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          session.status === 'active' ? 'bg-green-500' :
          session.status === 'idle' ? 'bg-yellow-500' :
          session.status === 'disconnected' ? 'bg-red-500' :
          'bg-gray-500'
        }`} />
        <span className="font-medium truncate" title={session.name}>
          {session.name}
        </span>
        {session.isClaudeSession && (
          <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded flex-shrink-0">
            Claude
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-2">
          {session.host.displayName}
        </span>
        {onMaximize && (
          <button
            onClick={(e) => { e.stopPropagation(); onMaximize(); }}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H4m0 0v4m0-4l5 5m7-5h4m0 0v4m0-4l-5 5M8 20H4m0 0v-4m0 4l5-5m7 5h4m0 0v-4m0 4l-5-5" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            )}
          </button>
        )}
        {onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 hover:bg-red-900/50 hover:text-red-400 rounded transition-colors"
            title="Kill session"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
