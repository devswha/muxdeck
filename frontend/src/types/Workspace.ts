import { Session } from './Session';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Extended type for UI grouping with sessions included
export interface WorkspaceWithSessions extends Workspace {
  sessions: Session[];
  isCollapsed: boolean;
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  hidden?: boolean;
}
