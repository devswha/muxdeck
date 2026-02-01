import { useState, useEffect, useCallback } from 'react';
import { AddHostDialog } from './AddHostDialog';
import { EditHostDialog } from './EditHostDialog';
import { ConfirmDialog } from './ConfirmDialog';

interface SSHHost {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  type: 'local' | 'ssh';
  connected?: boolean;
  useAgent?: boolean;
  passphraseEnvVar?: string;
  jumpHost?: {
    hostname: string;
    port: number;
    username: string;
    privateKeyPath?: string;
    password?: string;
  };
}

interface HostManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HostManagement({ isOpen, onClose }: HostManagementProps) {
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingHost, setEditingHost] = useState<SSHHost | null>(null);
  const [deletingHost, setDeletingHost] = useState<SSHHost | null>(null);
  const [testingHostId, setTestingHostId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const fetchHosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/hosts');
      if (!response.ok) {
        throw new Error('Failed to fetch hosts');
      }
      const data = await response.json();
      setHosts(data.hosts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch hosts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHosts();
    }
  }, [isOpen, fetchHosts]);

  const handleTestConnection = async (host: SSHHost) => {
    setTestingHostId(host.id);
    setTestResults(prev => ({ ...prev, [host.id]: { success: false, message: 'Testing...' } }));

    try {
      // Build the full SSHHostConfig that the backend expects
      const hostConfig: Record<string, unknown> = {
        hostname: host.hostname,
        port: host.port,
        username: host.username,
      };

      // Add optional fields if they exist
      if (host.privateKeyPath) {
        hostConfig.privateKeyPath = host.privateKeyPath;
      }
      if (host.password) {
        hostConfig.password = host.password;
      }
      if (host.useAgent) {
        hostConfig.useAgent = host.useAgent;
      }
      if (host.passphraseEnvVar) {
        hostConfig.passphraseEnvVar = host.passphraseEnvVar;
      }
      if (host.jumpHost) {
        hostConfig.jumpHost = host.jumpHost;
      }

      const response = await fetch('/api/hosts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hostConfig),
      });

      const data = await response.json();

      setTestResults(prev => ({
        ...prev,
        [host.id]: {
          success: data.success === true,
          message: data.error || data.message || (data.success ? 'Connection successful' : 'Connection failed'),
        },
      }));
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [host.id]: {
          success: false,
          message: err instanceof Error ? err.message : 'Connection test failed',
        },
      }));
    } finally {
      setTestingHostId(null);
    }
  };

  const handleDeleteHost = async () => {
    if (!deletingHost) return;

    try {
      const response = await fetch(`/api/hosts/${encodeURIComponent(deletingHost.id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete host');
      }

      await fetchHosts();
      setDeletingHost(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete host');
      setDeletingHost(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold">Host Management</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <button
                onClick={() => setShowAddDialog(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                Add Host
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-400">Loading hosts...</div>
              </div>
            ) : (
              <div className="space-y-3">
                {hosts.map(host => {
                  const testResult = testResults[host.id];
                  const isLocal = host.type === 'local';

                  return (
                    <div
                      key={host.id}
                      className="bg-gray-900 border border-gray-700 rounded-lg p-3 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Left: Name, IP, Status in one line */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <h3 className="font-medium truncate">{host.name}</h3>
                          {isLocal ? (
                            <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded shrink-0">
                              Local
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 shrink-0">
                              {host.hostname}:{host.port}
                            </span>
                          )}
                          {/* Connection status indicator */}
                          {!isLocal && (
                            <span className={`flex items-center gap-1 text-xs shrink-0 ${
                              testResult
                                ? (testResult.success ? 'text-green-400' : 'text-red-400')
                                : (host.connected ? 'text-green-400' : 'text-gray-500')
                            }`}>
                              <div className={`w-2 h-2 rounded-full ${
                                testResult
                                  ? (testResult.success ? 'bg-green-400' : 'bg-red-400')
                                  : (host.connected ? 'bg-green-400' : 'bg-gray-500')
                              }`} />
                              {testResult
                                ? (testResult.success ? 'OK' : 'Failed')
                                : (host.connected ? 'Connected' : 'Unknown')
                              }
                            </span>
                          )}
                        </div>

                        {/* Right: Action buttons */}
                        {!isLocal && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleTestConnection(host)}
                              disabled={testingHostId === host.id}
                              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors disabled:opacity-50"
                            >
                              {testingHostId === host.id ? 'Testing...' : 'Test'}
                            </button>
                            <button
                              onClick={() => setEditingHost(host)}
                              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingHost(host)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {hosts.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    No hosts configured. Add your first SSH host to get started.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <AddHostDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={() => {
          setShowAddDialog(false);
          fetchHosts();
        }}
      />

      {editingHost && (
        <EditHostDialog
          isOpen={!!editingHost}
          host={editingHost}
          onClose={() => setEditingHost(null)}
          onSuccess={() => {
            setEditingHost(null);
            fetchHosts();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deletingHost}
        title="Delete Host"
        message={`Are you sure you want to delete "${deletingHost?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
        onConfirm={handleDeleteHost}
        onCancel={() => setDeletingHost(null)}
      />
    </>
  );
}
