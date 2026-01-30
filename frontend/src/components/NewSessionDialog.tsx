import { useState, useEffect } from 'react';
import { Workspace } from '../types/Workspace';

interface Host {
  id: string;
  name: string;
  type: 'local' | 'ssh';
  hostname?: string;
  connected?: boolean;
}

interface AvailableSession {
  sessionName: string;
  sessionId: string;
}

interface NewSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (workingDirectory: string, sessionName?: string, hostId?: string, workspaceId?: string | null) => Promise<void>;
  onAttach?: (sessionName: string, hostId: string, workspaceId?: string | null) => Promise<void>;
  defaultWorkingDirectory?: string;
  defaultHostId?: string;
  workspaces: Workspace[];
  defaultWorkspaceId?: string;
}

type DialogMode = 'create' | 'attach';

export function NewSessionDialog({
  isOpen,
  onClose,
  onCreate,
  onAttach,
  defaultWorkingDirectory,
  defaultHostId,
  workspaces,
  defaultWorkspaceId,
}: NewSessionDialogProps) {
  const [mode, setMode] = useState<DialogMode>('create');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [selectedHostId, setSelectedHostId] = useState('local');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(defaultWorkspaceId || null);
  const [selectedSessionName, setSelectedSessionName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hosts, setHosts] = useState<Host[]>([{ id: 'local', name: 'Local', type: 'local', connected: true }]);
  const [availableSessions, setAvailableSessions] = useState<AvailableSession[]>([]);

  // Sync workspace selection when dialog reopens with different defaultWorkspaceId
  useEffect(() => {
    if (isOpen) {
      setSelectedWorkspaceId(defaultWorkspaceId || null);
    }
  }, [isOpen, defaultWorkspaceId]);

  useEffect(() => {
    if (!isOpen) return;

    // Set defaults when dialog opens
    if (defaultWorkingDirectory) {
      setWorkingDirectory(defaultWorkingDirectory);
    }
    if (defaultHostId) {
      setSelectedHostId(defaultHostId);
    }

    fetch('/api/hosts')
      .then(res => res.json())
      .then(data => {
        if (data.hosts && data.hosts.length > 0) {
          setHosts(data.hosts);
        }
      })
      .catch(() => {
        // Fallback to local only if API fails
        setHosts([{ id: 'local', name: 'Local', type: 'local', connected: true }]);
      });
  }, [isOpen, defaultWorkingDirectory, defaultHostId]);

  useEffect(() => {
    if (!isOpen || mode !== 'attach') return;

    // Fetch available sessions for the selected host
    fetch(`/api/sessions/available?hostId=${selectedHostId}`)
      .then(res => res.json())
      .then(data => {
        if (data.sessions) {
          setAvailableSessions(data.sessions);
          if (data.sessions.length > 0) {
            setSelectedSessionName(data.sessions[0].sessionName);
          }
        }
      })
      .catch(() => {
        setAvailableSessions([]);
      });
  }, [isOpen, mode, selectedHostId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'create') {
        await onCreate(workingDirectory, sessionName || undefined, selectedHostId, selectedWorkspaceId);
      } else {
        if (!onAttach) {
          throw new Error('Attach functionality not available');
        }
        if (!selectedSessionName) {
          throw new Error('Please select a session to attach');
        }
        await onAttach(selectedSessionName, selectedHostId, selectedWorkspaceId);
      }

      // Reset form
      setWorkingDirectory('');
      setSessionName('');
      setSelectedHostId('local');
      setSelectedWorkspaceId(defaultWorkspaceId || null);
      setSelectedSessionName('');
      setMode('create');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode} session`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">
          {mode === 'create' ? 'New Claude Session' : 'Attach to Session'}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Mode Toggle */}
          <div className="mb-4">
            <div className="flex gap-2 p-1 bg-gray-900 rounded-md">
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                  mode === 'create'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Create New
              </button>
              <button
                type="button"
                onClick={() => setMode('attach')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                  mode === 'attach'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Attach Existing
              </button>
            </div>
          </div>

          {/* Host Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Host *
            </label>
            <select
              value={selectedHostId}
              onChange={(e) => setSelectedHostId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
            >
              {hosts.map(host => (
                <option key={host.id} value={host.id}>
                  {host.name}
                  {host.type === 'ssh' && host.hostname && ` (${host.hostname})`}
                </option>
              ))}
            </select>
          </div>

          {/* Workspace Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Workspace
            </label>
            <select
              value={selectedWorkspaceId || ''}
              onChange={(e) => setSelectedWorkspaceId(e.target.value || null)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">No workspace (Ungrouped)</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>

          {mode === 'create' ? (
            <>
              {/* Create Mode Fields */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Working Directory *
                </label>
                <input
                  type="text"
                  value={workingDirectory}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                  placeholder="/path/to/project"
                  required
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Session Name (optional)
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="my-project"
                  pattern="^[a-zA-Z0-9_-]*$"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Letters, numbers, dashes, and underscores only
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Attach Mode Fields */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Select Session *
                </label>
                {availableSessions.length > 0 ? (
                  <select
                    value={selectedSessionName}
                    onChange={(e) => setSelectedSessionName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
                  >
                    {availableSessions.map(session => (
                      <option key={session.sessionId} value={session.sessionName}>
                        {session.sessionName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-500">
                    No sessions available
                  </div>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                (mode === 'create' ? !workingDirectory : !selectedSessionName)
              }
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {loading
                ? mode === 'create'
                  ? 'Creating...'
                  : 'Attaching...'
                : mode === 'create'
                ? 'Create Session'
                : 'Attach Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
