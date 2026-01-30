import { WorkspaceWithSessions } from '../types/Workspace';
import { Session } from '../types/Session';
import { WorkspaceGroup } from './WorkspaceGroup';

interface WorkspaceGridProps {
  workspaces: WorkspaceWithSessions[];
  onToggleCollapse: (workspaceId: string) => void;
  onAddSession: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  renderSession: (session: Session) => React.ReactNode;
  onSessionDrop?: (sessionId: string, workspaceId: string) => void;
  dragOverWorkspaceId?: string | null;
}

export function WorkspaceGrid({
  workspaces,
  onToggleCollapse,
  onAddSession,
  onDeleteWorkspace,
  renderSession,
  onSessionDrop,
  dragOverWorkspaceId,
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
      {workspaces.map(workspace => (
        <WorkspaceGroup
          key={workspace.id}
          workspace={workspace}
          onToggleCollapse={onToggleCollapse}
          onAddSession={onAddSession}
          onDeleteWorkspace={onDeleteWorkspace}
          renderSession={renderSession}
          onSessionDrop={onSessionDrop}
          isDragOver={dragOverWorkspaceId === workspace.id}
        />
      ))}
    </div>
  );
}
