import { Session } from './Session';
import { Workspace, WorkspaceWithSessions } from './Workspace';

export interface Project {
  id: string;           // ${hostId}:${workingDirectory} or ${hostId}:ungrouped
  name: string;         // basename of workingDirectory or "Other"
  workingDirectory: string | null;
  hostId: string;
  sessions: Session[];
  isCollapsed: boolean;
}

/**
 * Groups sessions by their working directory into projects.
 * Sessions with null workingDirectory are grouped into an "Other" project.
 * Projects are sorted alphabetically by name, with "Other" always appearing last.
 */
export function groupSessionsByProject(sessions: Session[]): Project[] {
  const projectMap = new Map<string, Project>();

  for (const session of sessions) {
    const hostId = session.host.id;
    const workingDirectory = session.workingDirectory;

    // Create project ID
    const projectId = workingDirectory
      ? `${hostId}:${workingDirectory}`
      : `${hostId}:ungrouped`;

    // Get or create project
    if (!projectMap.has(projectId)) {
      const projectName = workingDirectory
        ? workingDirectory.split('/').filter(Boolean).pop() || 'Root'
        : 'Other';

      projectMap.set(projectId, {
        id: projectId,
        name: projectName,
        workingDirectory,
        hostId,
        sessions: [],
        isCollapsed: false,
      });
    }

    // Add session to project
    projectMap.get(projectId)!.sessions.push(session);
  }

  // Convert to array and sort
  const projects = Array.from(projectMap.values());

  projects.sort((a, b) => {
    // "Other" always goes last
    if (a.name === 'Other') return 1;
    if (b.name === 'Other') return -1;

    // Alphabetical sort (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return projects;
}

/**
 * Groups sessions by their workspaceId into workspace groups.
 * Sessions with null workspaceId are grouped into an "Ungrouped" section.
 */
export function groupSessionsByWorkspace(
  sessions: Session[],
  workspaces: Workspace[],
  collapsedWorkspaceIds: Set<string> = new Set()
): WorkspaceWithSessions[] {
  // Create a map of workspace ID to workspace with sessions
  const workspaceMap = new Map<string, WorkspaceWithSessions>();

  // Initialize all workspaces (even empty ones should appear)
  for (const workspace of workspaces) {
    workspaceMap.set(workspace.id, {
      ...workspace,
      sessions: [],
      isCollapsed: collapsedWorkspaceIds.has(workspace.id),
    });
  }

  // Create ungrouped workspace for sessions without workspaceId
  const ungroupedId = '__ungrouped__';
  workspaceMap.set(ungroupedId, {
    id: ungroupedId,
    name: 'Ungrouped',
    createdAt: '',
    updatedAt: '',
    sessions: [],
    isCollapsed: collapsedWorkspaceIds.has(ungroupedId),
  });

  // Assign sessions to workspaces
  for (const session of sessions) {
    const workspaceId = session.workspaceId || ungroupedId;
    const workspace = workspaceMap.get(workspaceId);
    if (workspace) {
      workspace.sessions.push(session);
    } else {
      // Session references non-existent workspace, put in ungrouped
      workspaceMap.get(ungroupedId)!.sessions.push(session);
    }
  }

  // Convert to array and sort (ungrouped last)
  const result = Array.from(workspaceMap.values());
  result.sort((a, b) => {
    if (a.id === ungroupedId) return 1;
    if (b.id === ungroupedId) return -1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return result;
}
