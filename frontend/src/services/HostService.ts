import { getToken } from './AuthService';

const API_BASE = '/api';

export interface Host {
  id: string;
  name: string;
  type: 'local' | 'ssh';
  hostname?: string;
  connected?: boolean;
}

function getAuthHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchHosts(): Promise<Host[]> {
  const response = await fetch(`${API_BASE}/hosts`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch hosts');
  }
  const data = await response.json();
  return data.hosts;
}
