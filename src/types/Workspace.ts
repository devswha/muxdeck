export interface Workspace {
  id: string;           // UUID
  name: string;         // User-defined name
  description?: string; // Optional description
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
}
