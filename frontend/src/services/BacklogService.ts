import { BacklogItem, CreateBacklogItemRequest, UpdateBacklogItemRequest, BacklogStats, BacklogStatus } from '../types/Backlog';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

export async function getBacklogItems(status?: BacklogStatus): Promise<BacklogItem[]> {
  const url = status
    ? `${API_BASE}/api/backlog?status=${status}`
    : `${API_BASE}/api/backlog`;
  return fetchWithAuth(url);
}

export async function getBacklogStats(): Promise<BacklogStats> {
  return fetchWithAuth(`${API_BASE}/api/backlog/stats`);
}

export async function createBacklogItem(item: CreateBacklogItemRequest): Promise<BacklogItem> {
  return fetchWithAuth(`${API_BASE}/api/backlog`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function updateBacklogItem(id: string, updates: UpdateBacklogItemRequest): Promise<BacklogItem> {
  return fetchWithAuth(`${API_BASE}/api/backlog/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteBacklogItem(id: string): Promise<void> {
  return fetchWithAuth(`${API_BASE}/api/backlog/${id}`, {
    method: 'DELETE',
  });
}

export async function exportBacklogMarkdown(): Promise<string> {
  const result = await fetchWithAuth(`${API_BASE}/api/backlog/export`);
  return result.markdown;
}
