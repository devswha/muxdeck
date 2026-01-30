import { clearAll as clearPersistence } from './PersistenceService';

const TOKEN_KEY = 'session-manager-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;

  try {
    // Basic JWT expiry check (decode without verification)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export async function checkAuthEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/status');
    const data = await response.json();
    return data.enabled;
  } catch {
    return false;
  }
}

export function logout(): void {
  clearToken();
  clearPersistence();
  window.location.reload();
}
