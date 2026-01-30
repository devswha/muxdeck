import { Project } from '../types/Project';
import { Session } from '../types/Session';
import { ProjectHeader } from './ProjectHeader';
import { SessionTile } from './SessionTile';

interface ProjectGroupProps {
  project: Project;
  onToggleCollapse: (projectId: string) => void;
  onSelectSession: (session: Session) => void;
  selectedSessionId: string | null;
  onViewTerminal?: (session: Session) => void;
  renderTerminal: (session: Session) => React.ReactNode;
  isFavorite?: (sessionId: string) => boolean;
  onToggleFavorite?: (sessionId: string) => void;
  onCloseSession?: (sessionId: string) => void;
  onAddSessionToProject?: (workingDirectory: string, hostId: string) => void;
}

export function ProjectGroup({
  project,
  onToggleCollapse,
  onSelectSession,
  selectedSessionId,
  onViewTerminal,
  renderTerminal,
  isFavorite,
  onToggleFavorite,
  onCloseSession,
  onAddSessionToProject,
}: ProjectGroupProps) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <ProjectHeader
        project={project}
        onToggleCollapse={() => onToggleCollapse(project.id)}
        sessionCount={project.sessions.length}
        onAddSession={onAddSessionToProject}
      />

      {!project.isCollapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 p-4 bg-gray-900">
          {project.sessions.map(session => (
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
        </div>
      )}
    </div>
  );
}
