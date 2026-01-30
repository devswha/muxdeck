import { useState, useCallback } from 'react';
import { Session } from '../types/Session';
import * as PersistenceService from '../services/PersistenceService';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() =>
    new Set(PersistenceService.getFavorites())
  );

  const updateSessions = useCallback((newSessions: Session[]) => {
    // Save terminated sessions to history
    for (const session of newSessions) {
      if (session.status === 'terminated') {
        PersistenceService.addToHistory(session);
      }
    }
    setSessions(newSessions);
    setLoading(false);
    setError(null);
  }, []);

  const addSession = useCallback((session: Session) => {
    setSessions(prev => {
      const exists = prev.some(s => s.id === session.id);
      if (exists) {
        return prev.map(s => s.id === session.id ? session : s);
      }
      return [...prev, session];
    });
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }, []);

  const updateSession = useCallback((session: Session) => {
    setSessions(prev => prev.map(s => s.id === session.id ? session : s));
  }, []);

  const getClaudeSessions = useCallback(() => {
    return sessions.filter(s => s.isClaudeSession && s.status !== 'terminated');
  }, [sessions]);

  const setLoadingState = useCallback((isLoading: boolean) => {
    setLoading(isLoading);
  }, []);

  const setErrorState = useCallback((err: string | null) => {
    setError(err);
    setLoading(false);
  }, []);

  // Favorites
  const toggleFavorite = useCallback((sessionId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
        PersistenceService.removeFavorite(sessionId);
      } else {
        next.add(sessionId);
        PersistenceService.addFavorite(sessionId);
      }
      return next;
    });
  }, []);

  const isFavorite = useCallback((sessionId: string) => {
    return favorites.has(sessionId);
  }, [favorites]);

  return {
    sessions,
    loading,
    error,
    showHistory,
    setShowHistory,
    favorites,
    toggleFavorite,
    isFavorite,
    updateSessions,
    addSession,
    removeSession,
    updateSession,
    getClaudeSessions,
    setLoading: setLoadingState,
    setError: setErrorState,
  };
}
