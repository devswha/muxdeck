import { useEffect } from 'react';
import { TerminalComponent } from './Terminal';
import { Session } from '../types/Session';

interface TerminalModalProps {
  session: Session | null;
  isOpen: boolean;
  onClose: () => void;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onReady?: (sessionId: string, write: (data: string) => void, writeln: (data: string) => void) => void;
}

export function TerminalModal({
  session,
  isOpen,
  onClose,
  onInput,
  onResize,
  onReady,
}: TerminalModalProps) {
  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !session) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 rounded-lg shadow-xl flex flex-col"
        style={{ width: '80vw', height: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 rounded-t-lg">
          <h2 className="text-lg font-semibold text-white">
            {session.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Terminal Content */}
        <div className="flex-1 p-4 overflow-hidden">
          <div className="h-full w-full">
            <TerminalComponent
              sessionId={session.id}
              onInput={onInput}
              onResize={onResize}
              onReady={onReady ? (write, writeln) => onReady(session.id, write, writeln) : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
