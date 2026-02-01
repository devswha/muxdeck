import { useState, useRef, useEffect } from 'react';

interface WorkspaceInfoButtonProps {
  workspace: {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
  };
  sessionCount: number;
  activeSessionCount: number;
  todoCount: number;
  completedTodoCount: number;
  hosts: Array<{
    id: string;
    name: string;
    type: string;
    hostname?: string;
  }>;
}

export function WorkspaceInfoButton({
  workspace,
  sessionCount,
  activeSessionCount,
  todoCount,
  completedTodoCount,
  hosts,
}: WorkspaceInfoButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const totalTodoCount = todoCount + completedTodoCount;
  const todoProgress = totalTodoCount > 0 ? (completedTodoCount / totalTodoCount) * 100 : 0;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getHostDisplay = (host: { name: string; type: string; hostname?: string }) => {
    if (host.type === 'local') {
      return 'Local';
    }
    return host.hostname || 'N/A';
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-gray-700 transition-colors duration-200 text-gray-400 hover:text-gray-200"
        title="Workspace Information"
        aria-label="Show workspace information"
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-[32rem] overflow-y-auto transition-all duration-200"
        >
          <div className="p-4 space-y-4">
            {/* Workspace Name and Description */}
            <div className="border-b border-gray-700 pb-3">
              <h3 className="text-xl font-bold text-white">{workspace.name}</h3>
              {workspace.description && (
                <p className="text-sm text-gray-400 mt-1">{workspace.description}</p>
              )}
            </div>

            {/* Tasks Summary */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-300">Tasks Summary</span>
                <span className="text-sm text-gray-400">
                  {todoCount} pending / {completedTodoCount} completed
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${todoProgress}%` }}
                />
              </div>
            </div>

            {/* Sessions */}
            <div className="flex justify-between items-center py-2 border-b border-gray-700">
              <span className="text-sm font-medium text-gray-300">Sessions</span>
              <span className="text-sm text-gray-400">
                {activeSessionCount} active / {sessionCount} total
              </span>
            </div>

            {/* Hosts for Testing */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Hosts for Testing</h4>
              <div className="space-y-1.5">
                {hosts.length > 0 ? (
                  hosts.map((host) => (
                    <div
                      key={host.id}
                      className="flex justify-between items-center text-sm bg-gray-750 rounded px-3 py-2"
                    >
                      <span className="text-gray-300 font-medium">{host.name}</span>
                      <span className="text-gray-400 font-mono text-xs">
                        {getHostDisplay(host)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 italic">No hosts configured</p>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="space-y-1 pt-2 border-t border-gray-700">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Created:</span>
                <span>{formatDate(workspace.createdAt)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Updated:</span>
                <span>{formatDate(workspace.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
