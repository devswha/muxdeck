import { WorkspaceWithSessions } from '../types/Workspace';
import { Session } from '../types/Session';

interface WorkspaceGroupProps {
  workspace: WorkspaceWithSessions;
  onToggleCollapse: (workspaceId: string) => void;
  onAddSession: (workspaceId: string) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  renderSession: (session: Session) => React.ReactNode;
  children?: React.ReactNode;
  onSessionDrop?: (sessionId: string, workspaceId: string) => void;
  isDragOver?: boolean;
}

export function WorkspaceGroup({
  workspace,
  onToggleCollapse,
  onAddSession,
  onDeleteWorkspace,
  renderSession,
  children,
  onSessionDrop,
  isDragOver = false,
}: WorkspaceGroupProps) {
  const chevronIcon = workspace.isCollapsed ? '▶' : '▼';
  const isUngrouped = workspace.name === 'Ungrouped';
  const canDelete = !isUngrouped;

  const handleToggle = () => {
    onToggleCollapse(workspace.id);
  };

  const handleAddSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddSession(workspace.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteWorkspace && canDelete) {
      onDeleteWorkspace(workspace.id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    console.log('DragOver on workspace:', workspace.name);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const sessionId = e.dataTransfer.getData('text/plain');
    console.log('Drop event:', { sessionId, workspaceId: workspace.id, onSessionDrop: !!onSessionDrop });
    if (sessionId && onSessionDrop) {
      console.log('Calling onSessionDrop');
      onSessionDrop(sessionId, workspace.id);
    }
  };

  return (
    <div className="mb-6" data-testid={`workspace-${workspace.id}`} data-workspace-name={workspace.name}>
      <div
        className={`flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 cursor-pointer hover:bg-gray-750 transition-colors group ${
          isDragOver ? 'bg-blue-900/30 border-blue-500' : ''
        }`}
        onClick={handleToggle}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-gray-400 flex-shrink-0 w-4 text-center">
            {chevronIcon}
          </span>
          <h2 className="text-lg font-semibold text-white truncate">
            {workspace.name}
          </h2>
          <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full flex-shrink-0">
            {workspace.sessions.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddSession}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Add session to this workspace"
          >
            + Add Session
          </button>
          {canDelete && onDeleteWorkspace && (
            <button
              onClick={handleDelete}
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors opacity-0 group-hover:opacity-100"
              title={workspace.sessions.length > 0
                ? `Delete workspace (${workspace.sessions.length} sessions will move to Ungrouped)`
                : 'Delete empty workspace'}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {!workspace.isCollapsed && (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 bg-gray-900 min-h-[100px] transition-colors ${
            isDragOver ? 'bg-blue-900/20' : ''
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {workspace.sessions.map((session) => (
            <div key={session.id}>{renderSession(session)}</div>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}
