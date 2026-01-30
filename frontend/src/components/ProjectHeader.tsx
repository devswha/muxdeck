import { Project } from '../types/Project';

interface ProjectHeaderProps {
  project: Project;
  onToggleCollapse: () => void;
  sessionCount: number;
  onAddSession?: (workingDirectory: string, hostId: string) => void;
}

export function ProjectHeader({
  project,
  onToggleCollapse,
  sessionCount,
  onAddSession,
}: ProjectHeaderProps) {
  const chevronIcon = project.isCollapsed ? '▶' : '▼';

  const handleAddSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddSession && project.workingDirectory) {
      onAddSession(project.workingDirectory, project.hostId);
    }
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 cursor-pointer hover:bg-gray-750 transition-colors group"
      onClick={onToggleCollapse}
      title={project.workingDirectory || 'Sessions without a working directory'}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-gray-400 flex-shrink-0 w-4 text-center">
          {chevronIcon}
        </span>
        <h2 className="text-lg font-semibold text-white truncate">
          {project.name}
        </h2>
        <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full flex-shrink-0">
          {sessionCount}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {project.workingDirectory && (
          <div className="text-xs text-gray-500 font-mono truncate max-w-md">
            {project.workingDirectory}
          </div>
        )}
        {project.workingDirectory && onAddSession && (
          <button
            onClick={handleAddSession}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Add session to this project"
          >
            + Add Session
          </button>
        )}
      </div>
    </div>
  );
}
