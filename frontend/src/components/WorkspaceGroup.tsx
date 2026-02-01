import { useState } from 'react';
import { WorkspaceWithSessions } from '../types/Workspace';
import { Session } from '../types/Session';
import { WorkspaceInfoButton } from './WorkspaceInfoButton';

interface WorkspaceGroupProps {
  workspace: WorkspaceWithSessions;
  onToggleCollapse: (workspaceId: string) => void;
  onAddSession: (workspaceId: string) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onRenameWorkspace?: (workspaceId: string, newName: string) => void;
  onToggleHidden?: (workspaceId: string) => void;
  renderSession: (session: Session) => React.ReactNode;
  children?: React.ReactNode;
  onSessionDrop?: (sessionId: string, workspaceId: string) => void;
  isDragOver?: boolean;
  todoCount: number;
  completedTodoCount: number;
  hosts: Array<{ id: string; name: string; type: string; hostname?: string }>;
  showHiddenWorkspaces?: boolean;
  onOpenTodo?: (workspaceId: string, workspaceName: string) => void;
}

export function WorkspaceGroup({
  workspace,
  onToggleCollapse,
  onAddSession,
  onDeleteWorkspace,
  onRenameWorkspace,
  onToggleHidden,
  renderSession,
  children,
  onSessionDrop,
  isDragOver = false,
  todoCount,
  completedTodoCount,
  hosts,
  showHiddenWorkspaces = false,
  onOpenTodo,
}: WorkspaceGroupProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(workspace.name);
  const chevronIcon = workspace.isCollapsed ? '▶' : '▼';

  const handleToggle = () => {
    onToggleCollapse(workspace.id);
  };

  const handleAddSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddSession(workspace.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteWorkspace) {
      onDeleteWorkspace(workspace.id);
    }
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditName(workspace.name);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editName.trim() && editName !== workspace.name && onRenameWorkspace) {
      onRenameWorkspace(workspace.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleRenameCancel = (e: React.MouseEvent | React.FocusEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditName(workspace.name);
  };

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleToggleHidden = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleHidden) {
      onToggleHidden(workspace.id);
    }
  };

  return (
    <div className="mb-6" data-testid={`workspace-${workspace.id}`} data-workspace-name={workspace.name}>
      <div
        className={`flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 cursor-pointer hover:bg-gray-750 transition-colors group ${
          isDragOver ? 'bg-blue-900/30 border-blue-500' : ''
        } ${workspace.hidden && showHiddenWorkspaces ? 'opacity-60' : ''}`}
        onClick={handleToggle}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-gray-400 flex-shrink-0 w-4 text-center">
            {chevronIcon}
          </span>
          {isEditing ? (
            <form onSubmit={handleRenameSubmit} className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onClick={handleInputClick}
                className="px-2 py-1 text-sm bg-gray-700 text-white border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                autoFocus
                onBlur={handleRenameCancel}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleRenameCancel(e as any);
                  }
                }}
              />
            </form>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white truncate">
                {workspace.name}
              </h2>
              {onRenameWorkspace && (
                <button
                  onClick={handleRenameClick}
                  className="text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Rename workspace"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
              )}
            </>
          )}
          <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full flex-shrink-0">
            {workspace.sessions.length}
          </span>
          <WorkspaceInfoButton
            workspace={{
              id: workspace.id,
              name: workspace.name,
              description: workspace.description,
              createdAt: workspace.createdAt,
              updatedAt: workspace.updatedAt,
            }}
            sessionCount={workspace.sessions.length}
            activeSessionCount={workspace.sessions.filter(s => s.status === 'active').length}
            todoCount={todoCount}
            completedTodoCount={completedTodoCount}
            hosts={hosts}
          />
          {onOpenTodo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenTodo(workspace.id, workspace.name);
              }}
              className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
              title="Open TODOs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onToggleHidden && (
            <button
              onClick={handleToggleHidden}
              className="p-1 text-gray-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
              title={workspace.hidden ? 'Show workspace' : 'Hide workspace'}
            >
              {workspace.hidden ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                  <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={handleAddSession}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Add session to this workspace"
          >
            + Add Session
          </button>
          {onDeleteWorkspace && (
            <button
              onClick={handleDelete}
              className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors opacity-0 group-hover:opacity-100"
              title={workspace.sessions.length > 0
                ? `Delete workspace (${workspace.sessions.length} sessions will be deleted)`
                : 'Delete empty workspace'}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {!workspace.isCollapsed && (
        <>
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
        </>
      )}
    </div>
  );
}
