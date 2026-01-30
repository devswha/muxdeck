const API_BASE = '/api';

export async function hideSession(sessionId: string): Promise<void> {
  const token = localStorage.getItem('session-manager-token');
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/hide`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to hide session');
  }
}
