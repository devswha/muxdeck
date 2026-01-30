import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionProvider, useSessionContext } from './context/SessionContext';
import { TerminalComponent } from './components/Terminal';
import { SessionControls } from './components/SessionControls';
import { NewSessionDialog } from './components/NewSessionDialog';
import { TerminalModal } from './components/TerminalModal';
import { Login } from './components/Login';
import { Session } from './types/Session';
import { Workspace } from './types/Workspace';
import { groupSessionsByWorkspace } from './types/Project';
import { getToken, isAuthenticated, checkAuthEnabled, logout } from './services/AuthService';
import * as PersistenceService from './services/PersistenceService';
import * as WorkspaceService from './services/WorkspaceService';
import { NewWorkspaceDialog } from './components/NewWorkspaceDialog';
import { WorkspaceGrid } from './components/WorkspaceGrid';
import { SessionTile } from './components/SessionTile';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { HostManagement } from './components/HostManagement';

function ConnectionStatus({ status }: { status: string }) {
  const statusConfig = {
    connected: { color: 'bg-green-500', text: 'Connected' },
    connecting: { color: 'bg-yellow-500 animate-pulse', text: 'Connecting...' },
    disconnected: { color: 'bg-red-500', text: 'Disconnected' },
    error: { color: 'bg-red-500', text: 'Error' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.disconnected;

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-sm text-gray-400">{config.text}</span>
    </div>
  );
}

function SessionManagerApp() {
  const {
    sessions,
    claudeSessions,
    loading,
    error,
    connectionStatus,
    subscribeToSession,
    unsubscribeFromSession,
    sendInput,
    resize,
    registerTerminal,
    unregisterTerminal,
    toggleFavorite,
    isFavorite,
    showHistory,
    setShowHistory,
    sessionHistory,
  } = useSessionContext();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [subscribedSessions, setSubscribedSessions] = useState<Set<string>>(new Set());
  const subscribedSessionsRef = useRef(subscribedSessions);
  subscribedSessionsRef.current = subscribedSessions;
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [newSessionDefaults, setNewSessionDefaults] = useState<{
    workingDirectory?: string;
    hostId?: string;
  }>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalSession, setModalSession] = useState<Session | null>(null);
  const lastViewedRestored = useRef(false);

  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<Set<string>>(new Set());
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(new Set());
  const [showHostManagement, setShowHostManagement] = useState(false);

  // Drag and drop state
  const {
    draggingSessionId,
    dragOverWorkspaceId,
    handleDragStart,
    handleDragEnd,
  } = useDragAndDrop();

  // Compute display sessions based on filters
  const displaySessions = (() => {
    let filtered = showAllSessions ? sessions : claudeSessions;

    // If showHistory is enabled, include terminated sessions from history
    if (showHistory) {
      // History entries that aren't in current sessions
      const currentIds = new Set(sessions.map(s => s.id));
      const historyOnlySessions: Session[] = sessionHistory
        .filter(h => !currentIds.has(h.sessionId))
        .map(h => ({
          id: h.sessionId,
          name: h.sessionName,
          host: { id: 'history', type: 'local' as const, displayName: h.hostDisplayName },
          tmux: { sessionId: '', sessionName: '', paneId: '', windowIndex: 0 },
          status: 'terminated' as const,
          isClaudeSession: h.isClaudeSession,
          process: { pid: 0, currentCommand: '' },
          createdAt: h.createdAt,
          lastActivityAt: h.terminatedAt || h.lastSeenAt,
          dimensions: { cols: 80, rows: 24 },
          workingDirectory: null,
          workspaceId: null,
        }));

      filtered = [...filtered, ...historyOnlySessions];
    }

    return filtered;
  })();

  // Fetch workspaces
  const fetchWorkspaces = useCallback(async () => {
    try {
      const data = await WorkspaceService.fetchWorkspaces();
      setWorkspaces(data);
    } catch (error) {
      console.error('Failed to fetch workspaces:', error);
    }
  }, []);

  // Fetch workspaces on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSessionId(session.id);
  }, []);

  const handleInput = useCallback((sessionId: string, data: string) => {
    sendInput(sessionId, data);
  }, [sendInput]);

  const handleResize = useCallback((sessionId: string, cols: number, rows: number) => {
    resize(sessionId, cols, rows);
  }, [resize]);

  const handleTerminalReady = useCallback((
    sessionId: string,
    write: (data: string) => void,
    writeln: (data: string) => void
  ) => {
    registerTerminal(sessionId, { write, writeln });

    if (!subscribedSessionsRef.current.has(sessionId)) {
      subscribeToSession(sessionId);
      setSubscribedSessions(prev => new Set(prev).add(sessionId));
    } else {
      // Already subscribed but new terminal - resubscribe to get buffer
      unsubscribeFromSession(sessionId);
      subscribeToSession(sessionId);
    }
  }, [registerTerminal, subscribeToSession, unsubscribeFromSession]);

  const handleCreateSession = useCallback(async (workingDirectory: string, sessionName?: string, hostId?: string, workspaceId?: string | null) => {
    setActionError(null);
    const token = getToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        workingDirectory,
        hostId: hostId || 'local',
        sessionName,
        workspaceId: workspaceId || undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create session');
    }
  }, []);

  const handleCloseNewSessionDialog = useCallback(() => {
    setShowNewSessionDialog(false);
    setNewSessionDefaults({});
    setSelectedWorkspaceId(null);
  }, []);

  // Workspace handlers
  const handleCreateWorkspace = useCallback(async (name: string, description?: string) => {
    await WorkspaceService.createWorkspace({ name, description });
    await fetchWorkspaces();
    setShowNewWorkspaceDialog(false);
  }, [fetchWorkspaces]);

  const handleDeleteWorkspace = useCallback(async (workspaceId: string) => {
    await WorkspaceService.deleteWorkspace(workspaceId);
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleAddSessionToWorkspace = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setShowNewSessionDialog(true);
  }, []);

  const handleToggleCollapse = useCallback((workspaceId: string) => {
    setCollapsedWorkspaceIds(prev => {
      const next = new Set(prev);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  }, []);

  const handleTogglePreviewCollapse = useCallback((sessionId: string) => {
    setExpandedPreviews(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const handleSessionDrop = useCallback(async (sessionId: string, workspaceId: string | null) => {
    try {
      await WorkspaceService.assignSessionToWorkspace(sessionId, workspaceId);
      await fetchWorkspaces();
    } catch (error) {
      console.error('Failed to move session:', error);
    } finally {
      handleDragEnd();
    }
  }, [fetchWorkspaces, handleDragEnd]);

  const handleAttachSession = useCallback(async (sessionName: string, hostId: string, workspaceId?: string | null) => {
    setActionError(null);
    const token = getToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch('/api/sessions/attach', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionName,
        hostId,
        workspaceId: workspaceId || undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to attach to session');
    }
  }, []);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  const openModal = useCallback((session: Session) => {
    setModalSession(session);
    PersistenceService.setLastViewedSessionId(session.id);
  }, []);

  const closeModal = useCallback(() => {
    if (modalSession) {
      unsubscribeFromSession(modalSession.id);
      unregisterTerminal(modalSession.id);
      setSubscribedSessions(prev => {
        const next = new Set(prev);
        next.delete(modalSession.id);
        return next;
      });
    }
    setModalSession(null);
    PersistenceService.setLastViewedSessionId(null);
  }, [modalSession, unsubscribeFromSession, unregisterTerminal]);

  const handleCloseSession = useCallback(async (sessionId: string) => {
    setActionError(null);
    const token = getToken();
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const data = await response.json();
      setActionError(data.error || 'Failed to close session');
      throw new Error(data.error || 'Failed to close session');
    }

    // If the closed session is in modal, close the modal
    if (modalSession?.id === sessionId) {
      closeModal();
    }
  }, [modalSession, closeModal]);

  // Restore last viewed session on load
  useEffect(() => {
    if (!loading && sessions.length > 0 && !lastViewedRestored.current) {
      lastViewedRestored.current = true;
      const lastViewedId = PersistenceService.getLastViewedSessionId();
      if (lastViewedId) {
        const session = sessions.find(s => s.id === lastViewedId && s.status !== 'terminated');
        if (session) {
          setModalSession(session);
        }
      }
    }
  }, [loading, sessions]);

  useEffect(() => {
    return () => {
      subscribedSessions.forEach(sessionId => {
        unsubscribeFromSession(sessionId);
        unregisterTerminal(sessionId);
      });
    };
  }, []);

  // Clear error after 5 seconds
  useEffect(() => {
    if (actionError) {
      const timer = setTimeout(() => setActionError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionError]);

  // Add dragend listener
  useEffect(() => {
    document.addEventListener('dragend', handleDragEnd);
    return () => document.removeEventListener('dragend', handleDragEnd);
  }, [handleDragEnd]);

  const renderTerminal = useCallback((session: Session) => {
    return (
      <TerminalComponent
        key={session.id}
        sessionId={session.id}
        onInput={handleInput}
        onResize={handleResize}
        onReady={(write, writeln) => handleTerminalReady(session.id, write, writeln)}
      />
    );
  }, [handleInput, handleResize, handleTerminalReady]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Project Manager</h1>
          <SessionControls
            onNewWorkspace={() => setShowNewWorkspaceDialog(true)}
            onManageHosts={() => setShowHostManagement(true)}
            onRefresh={handleRefresh}
          />
          <span className="text-sm text-gray-400">
            {displaySessions.length} session{displaySessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAllSessions}
              onChange={(e) => setShowAllSessions(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-400">Show all tmux</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-400">Show history</span>
          </label>
          <ConnectionStatus status={connectionStatus} />
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {(error || actionError) && (
        <div className="px-4 py-2 bg-red-900/50 border-b border-red-700 text-red-300 text-sm">
          {error || actionError}
        </div>
      )}

      <main className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading sessions...</div>
          </div>
        ) : (
          <WorkspaceGrid
            workspaces={groupSessionsByWorkspace(displaySessions, workspaces, collapsedWorkspaceIds)}
            onToggleCollapse={handleToggleCollapse}
            onAddSession={handleAddSessionToWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onSessionDrop={handleSessionDrop}
            dragOverWorkspaceId={dragOverWorkspaceId}
            renderSession={(session) => (
              <SessionTile
                key={session.id}
                session={session}
                isSelected={selectedSessionId === session.id}
                onSelect={handleSelectSession}
                onViewTerminal={openModal}
                isFavorite={isFavorite(session.id)}
                onToggleFavorite={toggleFavorite}
                onCloseSession={handleCloseSession}
                isPreviewCollapsed={!expandedPreviews.has(session.id)}
                onTogglePreviewCollapse={handleTogglePreviewCollapse}
                onDragStart={() => handleDragStart(session.id)}
                isDragging={draggingSessionId === session.id}
              >
                {renderTerminal(session)}
              </SessionTile>
            )}
          />
        )}
      </main>

      <footer className="px-4 py-2 border-t border-gray-700 bg-gray-800 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <span>Project Manager v1.0.0</span>
          <span>Ctrl+C to send interrupt | Escape to unfocus</span>
        </div>
      </footer>

      <NewWorkspaceDialog
        isOpen={showNewWorkspaceDialog}
        onClose={() => setShowNewWorkspaceDialog(false)}
        onCreate={handleCreateWorkspace}
      />

      <NewSessionDialog
        isOpen={showNewSessionDialog}
        onClose={handleCloseNewSessionDialog}
        onCreate={handleCreateSession}
        onAttach={handleAttachSession}
        defaultWorkingDirectory={newSessionDefaults.workingDirectory}
        defaultHostId={newSessionDefaults.hostId}
        workspaces={workspaces}
        defaultWorkspaceId={selectedWorkspaceId || undefined}
      />

      <TerminalModal
        session={modalSession}
        isOpen={!!modalSession}
        onClose={closeModal}
        onInput={handleInput}
        onResize={handleResize}
        onReady={handleTerminalReady}
      />

      <HostManagement
        isOpen={showHostManagement}
        onClose={() => setShowHostManagement(false)}
      />
    </div>
  );
}

function App() {
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthEnabled().then(enabled => {
      setAuthRequired(enabled);
      if (!enabled || isAuthenticated()) {
        setAuthenticated(true);
      }
    });
  }, []);

  if (authRequired === null) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (authRequired && !authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <SessionProvider>
      <SessionManagerApp />
    </SessionProvider>
  );
}

export default App;
