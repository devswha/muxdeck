import { useState, useEffect } from 'react';

interface SSHHost {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  type: 'local' | 'ssh';
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

interface EditHostDialogProps {
  isOpen: boolean;
  host: SSHHost;
  onClose: () => void;
  onSuccess: () => void;
}

interface HostFormData {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  privateKeyPath: string;
  password: string;
  useAgent: boolean;
  passphraseEnvVar: string;
  useJumpHost: boolean;
  jumpHost: {
    hostname: string;
    port: number;
    username: string;
    privateKeyPath?: string;
    password?: string;
  };
}

export function EditHostDialog({ isOpen, host, onClose, onSuccess }: EditHostDialogProps) {
  const [formData, setFormData] = useState<HostFormData>({
    id: '',
    name: '',
    hostname: '',
    port: 22,
    username: '',
    privateKeyPath: '~/.ssh/id_rsa',
    password: '',
    useAgent: false,
    passphraseEnvVar: '',
    useJumpHost: false,
    jumpHost: {
      hostname: '',
      port: 22,
      username: '',
      privateKeyPath: '~/.ssh/id_rsa',
      password: '',
    },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (isOpen && host) {
      setFormData({
        id: host.id,
        name: host.name,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        privateKeyPath: host.privateKeyPath || '',
        password: host.password || '',
        useAgent: host.useAgent || false,
        passphraseEnvVar: host.passphraseEnvVar || '',
        useJumpHost: !!host.jumpHost,
        jumpHost: host.jumpHost || {
          hostname: '',
          port: 22,
          username: '',
          privateKeyPath: '~/.ssh/id_rsa',
          password: '',
        },
      });
      setError(null);
      setTestResult(null);
    }
  }, [isOpen, host]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        name: formData.name,
        hostname: formData.hostname,
        port: formData.port,
        username: formData.username,
      };

      if (formData.privateKeyPath) {
        payload.privateKeyPath = formData.privateKeyPath;
      }

      if (formData.password) {
        payload.password = formData.password;
      }

      if (formData.useAgent) {
        payload.useAgent = true;
      }

      if (formData.passphraseEnvVar) {
        payload.passphraseEnvVar = formData.passphraseEnvVar;
      }

      if (formData.useJumpHost && formData.jumpHost.hostname) {
        payload.jumpHost = formData.jumpHost;
      }

      const response = await fetch(`/api/hosts/${encodeURIComponent(formData.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update host');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update host');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const payload: any = {
        hostname: formData.hostname,
        port: formData.port,
        username: formData.username,
      };

      if (formData.privateKeyPath) {
        payload.privateKeyPath = formData.privateKeyPath;
      }

      if (formData.password) {
        payload.password = formData.password;
      }

      if (formData.useAgent) {
        payload.useAgent = true;
      }

      if (formData.passphraseEnvVar) {
        payload.passphraseEnvVar = formData.passphraseEnvVar;
      }

      if (formData.useJumpHost && formData.jumpHost.hostname) {
        payload.jumpHost = formData.jumpHost;
      }

      const response = await fetch('/api/hosts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      setTestResult({
        success: response.ok,
        message: data.message || (response.ok ? 'Connection successful' : 'Connection failed'),
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Edit SSH Host</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300 text-sm">
              {error}
            </div>
          )}

          {testResult && (
            <div className={`mb-4 p-3 border rounded-md text-sm ${
              testResult.success
                ? 'bg-green-900/50 border-green-700 text-green-300'
                : 'bg-red-900/50 border-red-700 text-red-300'
            }`}>
              {testResult.message}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Host ID
                </label>
                <input
                  type="text"
                  value={formData.id}
                  disabled
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">ID cannot be changed</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Production Server"
                  required
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Hostname *
                </label>
                <input
                  type="text"
                  value={formData.hostname}
                  onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                  placeholder="example.com or 192.168.1.100"
                  required
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Port *
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                  required
                  min="1"
                  max="65535"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Username *
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="ubuntu"
                required
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Password (optional)
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Leave empty for key-based auth"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Use password authentication instead of SSH keys</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Private Key Path (optional)
              </label>
              <input
                type="text"
                value={formData.privateKeyPath}
                onChange={(e) => setFormData({ ...formData, privateKeyPath: e.target.value })}
                placeholder="~/.ssh/id_rsa"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty if using password authentication</p>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.useAgent}
                  onChange={(e) => setFormData({ ...formData, useAgent: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Use SSH Agent</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Passphrase Environment Variable (optional)
              </label>
              <input
                type="text"
                value={formData.passphraseEnvVar}
                onChange={(e) => setFormData({ ...formData, passphraseEnvVar: e.target.value })}
                placeholder="SSH_KEY_PASSPHRASE"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Environment variable containing the key passphrase</p>
            </div>

            <div className="border-t border-gray-700 pt-4">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={formData.useJumpHost}
                  onChange={(e) => setFormData({ ...formData, useJumpHost: e.target.checked })}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Use Jump Host (Bastion)</span>
              </label>

              {formData.useJumpHost && (
                <div className="ml-6 space-y-4 pl-4 border-l-2 border-gray-700">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Jump Host Hostname
                      </label>
                      <input
                        type="text"
                        value={formData.jumpHost.hostname}
                        onChange={(e) => setFormData({
                          ...formData,
                          jumpHost: { ...formData.jumpHost, hostname: e.target.value }
                        })}
                        placeholder="bastion.example.com"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        value={formData.jumpHost.port}
                        onChange={(e) => setFormData({
                          ...formData,
                          jumpHost: { ...formData.jumpHost, port: parseInt(e.target.value) || 22 }
                        })}
                        min="1"
                        max="65535"
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Jump Host Username
                    </label>
                    <input
                      type="text"
                      value={formData.jumpHost.username}
                      onChange={(e) => setFormData({
                        ...formData,
                        jumpHost: { ...formData.jumpHost, username: e.target.value }
                      })}
                      placeholder="ubuntu"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Jump Host Password (optional)
                    </label>
                    <input
                      type="password"
                      value={formData.jumpHost.password}
                      onChange={(e) => setFormData({
                        ...formData,
                        jumpHost: { ...formData.jumpHost, password: e.target.value }
                      })}
                      placeholder="Leave empty for key-based auth"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Jump Host Private Key Path (optional)
                    </label>
                    <input
                      type="text"
                      value={formData.jumpHost.privateKeyPath}
                      onChange={(e) => setFormData({
                        ...formData,
                        jumpHost: { ...formData.jumpHost, privateKeyPath: e.target.value }
                      })}
                      placeholder="~/.ssh/id_rsa"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between gap-2 mt-6 pt-6 border-t border-gray-700">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !formData.hostname || !formData.username}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <div className="flex gap-2">
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
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
