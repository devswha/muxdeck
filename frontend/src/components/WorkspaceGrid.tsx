import { WorkspaceWithSessions } from '../types/Workspace';
import { Session } from '../types/Session';
import { WorkspaceGroup } from './WorkspaceGroup';

interface WorkspaceGridProps {
  workspaces: WorkspaceWithSessions[];
  onToggleCollapse: (workspaceId: string) => void;
  onAddSession: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onRenameWorkspace?: (workspaceId: string, newName: string) => void;
  onToggleHidden?: (workspaceId: string) => void;
  renderSession: (session: Session) => React.ReactNode;
  onSessionDrop?: (sessionId: string, workspaceId: string) => void;
  dragOverWorkspaceId?: string | null;
  todoStats: Record<string, { pending: number; completed: number }>;
  hosts: Array<{ id: string; name: string; type: string; hostname?: string }>;
  showHiddenWorkspaces?: boolean;
  onOpenTodo?: (workspaceId: string, workspaceName: string) => void;
}

export function WorkspaceGrid({
  workspaces,
  onToggleCollapse,
  onAddSession,
  onDeleteWorkspace,
  onRenameWorkspace,
  onToggleHidden,
  renderSession,
  onSessionDrop,
  dragOverWorkspaceId,
  todoStats,
  hosts,
  showHiddenWorkspaces = false,
  onOpenTodo,
}: WorkspaceGridProps) {
  if (workspaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">No workspaces yet</p>
          <p className="text-sm">Create a workspace to organize your sessions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-900 min-h-screen">
      {workspaces.map(workspace => {
        const stats = todoStats[workspace.id] || { pending: 0, completed: 0 };
        return (
          <WorkspaceGroup
            key={workspace.id}
            workspace={workspace}
            onToggleCollapse={onToggleCollapse}
            onAddSession={onAddSession}
            onDeleteWorkspace={onDeleteWorkspace}
            onRenameWorkspace={onRenameWorkspace}
            onToggleHidden={onToggleHidden}
            renderSession={renderSession}
            onSessionDrop={onSessionDrop}
            isDragOver={dragOverWorkspaceId === workspace.id}
            todoCount={stats.pending}
            completedTodoCount={stats.completed}
            hosts={hosts}
            showHiddenWorkspaces={showHiddenWorkspaces}
            onOpenTodo={onOpenTodo}
          />
        );
      })}
    </div>
  );
}
