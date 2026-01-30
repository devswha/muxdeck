import { Session } from '../types/Session';

const STORAGE_KEY = 'session-manager-persistence';
const CURRENT_VERSION = 3;

export interface HistoryEntry {
  sessionId: string;
  sessionName: string;
  hostDisplayName: string;
  isClaudeSession: boolean;
  createdAt: string;
  terminatedAt: string | null;
  lastSeenAt: string;
}

interface PersistedState {
  version: number;
  lastViewedSessionId: string | null;
  favoriteSessionIds: string[];
  sessionHistory: HistoryEntry[];
  collapsedProjectIds: string[];
  collapsedWorkspaceIds: string[];
}

function getDefaultState(): PersistedState {
  return {
    version: CURRENT_VERSION,
    lastViewedSessionId: null,
    favoriteSessionIds: [],
    sessionHistory: [],
    collapsedProjectIds: [],
    collapsedWorkspaceIds: [],
  };
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();

    const state = JSON.parse(raw) as PersistedState;
    if (state.version !== CURRENT_VERSION) {
      // Handle migration from version 1 to 2
      if (state.version === 1) {
        return {
          ...state,
          version: CURRENT_VERSION,
          collapsedProjectIds: [],
          collapsedWorkspaceIds: [],
        };
      }
      // Handle migration from version 2 to 3
      if (state.version === 2) {
        return {
          ...state,
          version: CURRENT_VERSION,
          collapsedWorkspaceIds: [...(state.collapsedProjectIds || [])],
        };
      }
      // Unknown version, reset
      return getDefaultState();
    }
    return state;
  } catch {
    return getDefaultState();
  }
}

function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently fail if localStorage is full or unavailable
  }
}

// Last viewed session
export function getLastViewedSessionId(): string | null {
  return loadState().lastViewedSessionId;
}

export function setLastViewedSessionId(sessionId: string | null): void {
  const state = loadState();
  state.lastViewedSessionId = sessionId;
  saveState(state);
}

// Favorites
export function getFavorites(): string[] {
  return loadState().favoriteSessionIds;
}

export function addFavorite(sessionId: string): void {
  const state = loadState();
  if (!state.favoriteSessionIds.includes(sessionId)) {
    state.favoriteSessionIds.push(sessionId);
    saveState(state);
  }
}

export function removeFavorite(sessionId: string): void {
  const state = loadState();
  state.favoriteSessionIds = state.favoriteSessionIds.filter(id => id !== sessionId);
  saveState(state);
}

export function isFavorite(sessionId: string): boolean {
  return loadState().favoriteSessionIds.includes(sessionId);
}

// Session history
export function getSessionHistory(): HistoryEntry[] {
  return loadState().sessionHistory;
}

export function addToHistory(session: Session): void {
  const state = loadState();

  // Check if already in history
  const existingIndex = state.sessionHistory.findIndex(h => h.sessionId === session.id);

  const entry: HistoryEntry = {
    sessionId: session.id,
    sessionName: session.name,
    hostDisplayName: session.host.displayName,
    isClaudeSession: session.isClaudeSession,
    createdAt: session.createdAt,
    terminatedAt: session.status === 'terminated' ? new Date().toISOString() : null,
    lastSeenAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    state.sessionHistory[existingIndex] = entry;
  } else {
    state.sessionHistory.unshift(entry);
    // Keep only last 50 entries
    if (state.sessionHistory.length > 50) {
      state.sessionHistory = state.sessionHistory.slice(0, 50);
    }
  }

  saveState(state);
}

export function removeFromHistory(sessionId: string): void {
  const state = loadState();
  state.sessionHistory = state.sessionHistory.filter(h => h.sessionId !== sessionId);
  saveState(state);
}

// Project collapse state
export function getCollapsedProjectIds(): string[] {
  return loadState().collapsedProjectIds;
}

export function isProjectCollapsed(projectId: string): boolean {
  return loadState().collapsedProjectIds.includes(projectId);
}

export function toggleProjectCollapsed(projectId: string): void {
  const state = loadState();
  const index = state.collapsedProjectIds.indexOf(projectId);

  if (index >= 0) {
    // Expand: remove from collapsed list
    state.collapsedProjectIds.splice(index, 1);
  } else {
    // Collapse: add to collapsed list
    state.collapsedProjectIds.push(projectId);
  }

  saveState(state);
}

// Workspace collapse state
export function getCollapsedWorkspaceIds(): Set<string> {
  return new Set(loadState().collapsedWorkspaceIds);
}

export function setCollapsedWorkspaceIds(ids: Set<string>): void {
  const state = loadState();
  state.collapsedWorkspaceIds = Array.from(ids);
  saveState(state);
}

export function toggleWorkspaceCollapsed(workspaceId: string): void {
  const state = loadState();
  const index = state.collapsedWorkspaceIds.indexOf(workspaceId);

  if (index >= 0) {
    // Expand: remove from collapsed list
    state.collapsedWorkspaceIds.splice(index, 1);
  } else {
    // Collapse: add to collapsed list
    state.collapsedWorkspaceIds.push(workspaceId);
  }

  saveState(state);
}

// Clear all persisted data (for logout)
export function clearAll(): void {
  localStorage.removeItem(STORAGE_KEY);
}
