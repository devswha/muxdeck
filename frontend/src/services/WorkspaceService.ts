import { Workspace, CreateWorkspaceRequest, UpdateWorkspaceRequest } from '../types/Workspace';
import { Session } from '../types/Session';

const API_BASE = '/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('session-manager-token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const response = await fetch(`${API_BASE}/workspaces`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch workspaces');
  }
  const data = await response.json();
  return data.workspaces;
}

export async function createWorkspace(request: CreateWorkspaceRequest): Promise<Workspace> {
  const response = await fetch(`${API_BASE}/workspaces`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create workspace');
  }
  return response.json();
}

export async function updateWorkspace(id: string, request: UpdateWorkspaceRequest): Promise<Workspace> {
  const response = await fetch(`${API_BASE}/workspaces/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update workspace');
  }
  return response.json();
}

export async function deleteWorkspace(id: string): Promise<void> {
  const token = localStorage.getItem('session-manager-token');
  const response = await fetch(`${API_BASE}/workspaces/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    // Only try to parse JSON if there's content
    const text = await response.text();
    if (text) {
      const error = JSON.parse(text);
      throw new Error(error.error || 'Failed to delete workspace');
    }
    throw new Error('Failed to delete workspace');
  }
}

export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  const response = await fetch(`${API_BASE}/workspaces/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to rename workspace');
  }
  return response.json();
}

export async function assignSessionToWorkspace(
  sessionId: string,
  workspaceId: string | null
): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/workspace`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ workspaceId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign session to workspace');
  }
  return response.json();
}

export async function hideWorkspace(id: string): Promise<Workspace> {
  const response = await fetch(`${API_BASE}/workspaces/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ hidden: true }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to hide workspace');
  }
  const data = await response.json();
  return data.workspace;
}

export async function showWorkspace(id: string): Promise<Workspace> {
  const response = await fetch(`${API_BASE}/workspaces/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ hidden: false }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to show workspace');
  }
  const data = await response.json();
  return data.workspace;
}
