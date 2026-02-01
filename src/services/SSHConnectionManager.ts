import { Client, ConnectConfig, ClientChannel } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { SSHHostConfig, getHostConfig, getAllHosts, JumpHostConfig } from '../config/hosts.js';
import * as pty from 'node-pty';

interface SSHConnection {
  client: Client;
  hostId: string;
  connected: boolean;
  lastError?: string;
  reconnectTimeout?: NodeJS.Timeout;
  jumpClient?: Client;
  reconnectAttempts?: number;
  lastDisconnectTime?: number;
  nativeSshProcess?: pty.IPty;
  useNativeSsh?: boolean;
}

type ConnectionCallback = (hostId: string, connected: boolean, error?: string) => void;

export class SSHConnectionManager {
  private connections: Map<string, SSHConnection> = new Map();
  private connectionListeners: Set<ConnectionCallback> = new Set();
  private useNativeSshForJumpHosts: boolean = false; // Toggle to use native SSH instead of ssh2 forwardOut (not fully implemented, kept for future use)

  async connect(hostId: string): Promise<Client> {
    const existing = this.connections.get(hostId);
    if (existing?.connected) {
      return existing.client;
    }

    const hostConfig = getHostConfig(hostId);
    if (!hostConfig) {
      throw new Error(`Host not found: ${hostId}`);
    }

    const client = new Client();

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        console.log(`SSH connected to ${hostId}`);
        this.connections.set(hostId, {
          client,
          hostId,
          connected: true,
        });
        this.notifyListeners(hostId, true);
        resolve(client);
      });

      client.on('error', (err) => {
        console.error(`SSH error for ${hostId}:`, err.message);
        const conn = this.connections.get(hostId);
        if (conn) {
          conn.connected = false;
          conn.lastError = err.message;
        }
        this.notifyListeners(hostId, false, err.message);
        reject(err);
      });

      client.on('close', () => {
        console.log(`SSH connection closed for ${hostId}`);
        const conn = this.connections.get(hostId);
        if (conn) {
          conn.connected = false;
          conn.lastDisconnectTime = Date.now();

          // Clean up native SSH process if exists
          if (conn.nativeSshProcess) {
            conn.nativeSshProcess.kill();
            conn.nativeSshProcess = undefined;
          }

          // Clean up jump client if exists
          if (conn.jumpClient) {
            conn.jumpClient.removeAllListeners();
            conn.jumpClient.end();
            conn.jumpClient = undefined;
          }

          this.scheduleReconnect(hostId);
        }
        this.notifyListeners(hostId, false);
      });

      const connectConfig = this.buildConnectConfig(hostConfig);

      if (hostConfig.jumpHost) {
        this.connectViaJumpHost(client, hostConfig, connectConfig, resolve, reject);
      } else {
        client.connect(connectConfig);
      }
    });
  }

  private buildConnectConfig(hostConfig: SSHHostConfig): ConnectConfig {
    const config: ConnectConfig = {
      host: hostConfig.hostname,
      port: hostConfig.port,
      username: hostConfig.username,
    };

    // Password authentication
    const password = this.resolvePassword(hostConfig);
    if (password) {
      config.password = password;
    }

    // Load private key (if provided)
    if (hostConfig.privateKeyPath && existsSync(hostConfig.privateKeyPath)) {
      config.privateKey = readFileSync(hostConfig.privateKeyPath);
    }

    // Resolve passphrase
    const passphrase = this.resolvePassphrase(hostConfig);
    if (passphrase) {
      config.passphrase = passphrase;
    }

    // Use ssh-agent if explicitly enabled
    if (hostConfig.useAgent === true) {
      config.agent = process.env.SSH_AUTH_SOCK;
    }

    return config;
  }

  private resolvePassword(config: SSHHostConfig): string | undefined {
    if (config.passwordEnvVar) {
      const envValue = process.env[config.passwordEnvVar];
      if (envValue) return envValue;
    }
    return config.password;
  }

  private resolvePassphrase(config: SSHHostConfig | JumpHostConfig): string | undefined {
    // Priority: env var > direct passphrase
    if (config.passphraseEnvVar) {
      const envValue = process.env[config.passphraseEnvVar];
      if (envValue) return envValue;
    }
    return config.passphrase;
  }

  private async connectViaJumpHost(
    targetClient: Client,
    hostConfig: SSHHostConfig,
    targetConfig: ConnectConfig,
    resolve: (client: Client) => void,
    reject: (err: Error) => void
  ): Promise<void> {
    // Try native SSH first if enabled
    if (this.useNativeSshForJumpHosts) {
      try {
        await this.connectViaJumpHostNative(targetClient, hostConfig, targetConfig, resolve, reject);
        return;
      } catch (err) {
        console.warn('Native SSH failed, falling back to ssh2 forwardOut:', err instanceof Error ? err.message : err);
        // Fall through to original ssh2 method
      }
    }

    // Original ssh2 forwardOut method (fallback)
    const jumpConfig = hostConfig.jumpHost!;
    const jumpClient = new Client();
    let jumpConnected = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      if (jumpClient) {
        jumpClient.removeAllListeners();
        jumpClient.end();
      }
    };

    const jumpConnectConfig: ConnectConfig = {
      host: jumpConfig.hostname,
      port: jumpConfig.port,
      username: jumpConfig.username,
      readyTimeout: 30000,
    };

    // Add password authentication for jump host
    if (jumpConfig.password) {
      jumpConnectConfig.password = jumpConfig.password;
    }

    if (jumpConfig.privateKeyPath && existsSync(jumpConfig.privateKeyPath)) {
      jumpConnectConfig.privateKey = readFileSync(jumpConfig.privateKeyPath);
    }

    const jumpPassphrase = this.resolvePassphrase(jumpConfig);
    if (jumpPassphrase) {
      jumpConnectConfig.passphrase = jumpPassphrase;
    }

    // Always include ssh-agent when available
    if (process.env.SSH_AUTH_SOCK) {
      jumpConnectConfig.agent = process.env.SSH_AUTH_SOCK;
    }

    // Set overall timeout for jump host connection
    timeoutHandle = setTimeout(() => {
      if (!jumpConnected) {
        cleanup();
        reject(new Error(`Jump host connection timeout: ${jumpConfig.hostname}`));
      }
    }, 30000);

    jumpClient.on('ready', () => {
      jumpConnected = true;
      console.log(`Jump host connected: ${jumpConfig.hostname}`);

      jumpClient.forwardOut(
        '127.0.0.1',
        0,
        hostConfig.hostname,
        hostConfig.port,
        (err, stream) => {
          if (err) {
            console.error(`Jump host forward failed: ${err.message}`);
            cleanup();
            reject(new Error(`Jump host forward error: ${err.message}`));
            return;
          }

          // Store jump client reference for cleanup
          const conn = this.connections.get(hostConfig.id);
          if (conn) {
            conn.jumpClient = jumpClient;
          }

          // Clear timeout once forwarding is established
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = undefined;
          }

          targetClient.connect({
            ...targetConfig,
            sock: stream,
          });
        }
      );
    });

    jumpClient.on('error', (err) => {
      console.error(`Jump host error for ${jumpConfig.hostname}:`, err.message);
      cleanup();
      reject(new Error(`Jump host error: ${err.message}`));
    });

    jumpClient.on('close', () => {
      console.log(`Jump host connection closed: ${jumpConfig.hostname}`);
      if (jumpConnected) {
        // If jump host closes, the target connection should also close
        const conn = this.connections.get(hostConfig.id);
        if (conn) {
          conn.connected = false;
          conn.lastError = 'Jump host connection lost';
          this.notifyListeners(hostConfig.id, false, 'Jump host connection lost');
        }
      }
    });

    try {
      jumpClient.connect(jumpConnectConfig);
    } catch (err) {
      cleanup();
      reject(new Error(`Failed to connect to jump host: ${err instanceof Error ? err.message : 'Unknown error'}`));
    }
  }

  private async connectViaJumpHostNative(
    targetClient: Client,
    hostConfig: SSHHostConfig,
    targetConfig: ConnectConfig,
    resolve: (client: Client) => void,
    reject: (err: Error) => void
  ): Promise<void> {
    // Note: This method attempts to use native SSH with ProxyCommand/ProxyJump
    // However, ssh2 library expects a stream, which is difficult to create from
    // a native SSH process. This is kept for terminal connections via shellNative().
    // For now, throw an error to fall back to ssh2 forwardOut method.
    throw new Error('Native SSH with stream wrapper not fully implemented, using ssh2 fallback');
  }


  private scheduleReconnect(hostId: string): void {
    const conn = this.connections.get(hostId);
    if (!conn || conn.reconnectTimeout) return;

    // Track reconnect attempts
    const attempts = (conn.reconnectAttempts || 0) + 1;
    conn.reconnectAttempts = attempts;
    conn.lastDisconnectTime = Date.now();

    // Exponential backoff: 5s, 10s, 20s, max 60s
    const baseDelay = 5000;
    const maxDelay = 60000;
    const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);

    console.log(`Scheduling reconnect for ${hostId} in ${delay}ms (attempt ${attempts})`);

    conn.reconnectTimeout = setTimeout(async () => {
      conn.reconnectTimeout = undefined;
      try {
        console.log(`Attempting reconnect to ${hostId}...`);
        await this.connect(hostId);
        // Reset attempts on successful reconnect
        conn.reconnectAttempts = 0;
        console.log(`Successfully reconnected to ${hostId}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Reconnect failed for ${hostId}: ${errorMsg}`);
        conn.lastError = errorMsg;
        this.notifyListeners(hostId, false, errorMsg);

        // Only retry if not exceeding max attempts (10 attempts)
        const currentAttempts = conn.reconnectAttempts || 0;
        if (currentAttempts < 10) {
          this.scheduleReconnect(hostId);
        } else {
          console.error(`Max reconnect attempts reached for ${hostId}, giving up`);
          conn.lastError = `Max reconnect attempts (10) exceeded: ${errorMsg}`;
          this.notifyListeners(hostId, false, conn.lastError);
        }
      }
    }, delay);
  }

  async exec(hostId: string, command: string): Promise<string> {
    // Use native SSH for jump host connections (supports password auth)
    const hostConfig = getHostConfig(hostId);
    if (hostConfig?.jumpHost) {
      return this.execNative(hostId, command);
    }

    const client = await this.connect(hostId);

    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        stream.on('close', (code: number) => {
          if (code !== 0 && stderr) {
            reject(new Error(stderr));
          } else {
            resolve(stdout);
          }
        });
      });
    });
  }

  /**
   * Execute command using native SSH (for jump host connections with password auth)
   */
  async execNative(hostId: string, command: string): Promise<string> {
    const hostConfig = getHostConfig(hostId);
    if (!hostConfig) {
      throw new Error(`Host not found: ${hostId}`);
    }

    return new Promise((resolve, reject) => {
      try {
        const args: string[] = [];

        // Add jump host if configured
        if (hostConfig.jumpHost) {
          const jumpConfig = hostConfig.jumpHost;
          args.push('-J', `${jumpConfig.username}@${jumpConfig.hostname}:${jumpConfig.port}`);
        }

        // Target host connection
        args.push(`${hostConfig.username}@${hostConfig.hostname}`);
        args.push('-p', String(hostConfig.port));
        args.push('-o', 'StrictHostKeyChecking=no');
        args.push('-o', 'UserKnownHostsFile=/dev/null');
        args.push('-o', 'ConnectTimeout=10');
        // Batch mode off to allow password prompts
        args.push('-o', 'BatchMode=no');

        // Add target host private key
        if (hostConfig.privateKeyPath && existsSync(hostConfig.privateKeyPath)) {
          args.push('-i', hostConfig.privateKeyPath);
        }

        // Add jump host private key
        if (hostConfig.jumpHost?.privateKeyPath && existsSync(hostConfig.jumpHost.privateKeyPath)) {
          args.push('-i', hostConfig.jumpHost.privateKeyPath);
        }

        // Add the command to execute
        args.push(command);

        console.log(`[execNative] Executing: ssh ${args.join(' ')}`);

        const timeout = hostConfig.jumpHost ? 30000 : 10000;
        let timeoutHandle: NodeJS.Timeout | undefined;
        let completed = false;

        const sshProcess = pty.spawn('ssh', args, {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME || '/',
          env: process.env as { [key: string]: string },
        });

        let output = '';

        timeoutHandle = setTimeout(() => {
          if (!completed) {
            completed = true;
            sshProcess.kill();
            reject(new Error(`Command timeout after ${timeout / 1000} seconds`));
          }
        }, timeout);

        // Handle password authentication
        const password = this.resolvePassword(hostConfig);
        const jumpPassword = hostConfig.jumpHost?.password;

        if (password || jumpPassword) {
          let passwordsSent = 0;
          const maxPasswords = (jumpPassword ? 1 : 0) + (password ? 1 : 0);
          let lastPasswordTime = 0;

          const handleData = (data: string) => {
            output += data;

            // Check for password prompt with debounce
            const now = Date.now();
            const hasPasswordPrompt = data.toLowerCase().includes('password:') || data.includes('Password:');
            if (hasPasswordPrompt && passwordsSent < maxPasswords && (now - lastPasswordTime) > 500) {
              passwordsSent++;
              lastPasswordTime = now;

              setTimeout(() => {
                if (passwordsSent === 1 && jumpPassword) {
                  sshProcess.write(jumpPassword + '\n');
                } else if (password) {
                  sshProcess.write(password + '\n');
                }
              }, 150);
            }
          };

          sshProcess.onData(handleData);
        } else {
          sshProcess.onData((data) => {
            output += data;
          });
        }

        sshProcess.onExit(({ exitCode }) => {
          if (!completed) {
            completed = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);

            if (exitCode === 0) {
              // Clean output: remove ANSI codes and password prompts
              const cleanOutput = output
                .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
                .replace(/.*[Pp]assword:.*\n?/g, '') // Remove password prompts
                .trim();

              resolve(cleanOutput);
            } else {
              reject(new Error(`SSH command failed with exit code ${exitCode}: ${output.slice(-200)}`));
            }
          }
        });
      } catch (err) {
        reject(new Error(`Native SSH exec error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  async shell(hostId: string): Promise<ClientChannel> {
    const client = await this.connect(hostId);

    return new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color' }, (err, stream) => {
        if (err) reject(err);
        else resolve(stream);
      });
    });
  }

  /**
   * Create a native SSH shell using pty (for terminal connections with jump hosts)
   * Returns a pty.IPty instead of ClientChannel
   */
  async shellNative(hostId: string): Promise<pty.IPty> {
    const hostConfig = getHostConfig(hostId);
    if (!hostConfig) {
      throw new Error(`Host not found: ${hostId}`);
    }

    const args: string[] = [];

    // Add jump host if configured
    if (hostConfig.jumpHost) {
      const jumpConfig = hostConfig.jumpHost;
      args.push('-J', `${jumpConfig.username}@${jumpConfig.hostname}:${jumpConfig.port}`);

      // Add jump host private key
      if (jumpConfig.privateKeyPath && existsSync(jumpConfig.privateKeyPath)) {
        args.push('-i', jumpConfig.privateKeyPath);
      }
    }

    // Target host connection
    args.push(`${hostConfig.username}@${hostConfig.hostname}`);
    args.push('-p', String(hostConfig.port));
    args.push('-o', 'StrictHostKeyChecking=no');
    args.push('-o', 'UserKnownHostsFile=/dev/null');

    // Add target host private key
    if (hostConfig.privateKeyPath && existsSync(hostConfig.privateKeyPath)) {
      args.push('-i', hostConfig.privateKeyPath);
    }

    console.log(`Starting native SSH shell: ssh ${args.join(' ')}`);

    const sshProcess = pty.spawn('ssh', args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || '/',
      env: process.env as { [key: string]: string },
    });

    // Handle password authentication
    const password = this.resolvePassword(hostConfig);
    const jumpPassword = hostConfig.jumpHost?.password;

    if (password || jumpPassword) {
      let passwordsSent = 0;
      const maxPasswords = (jumpPassword ? 1 : 0) + (password ? 1 : 0);

      const passwordHandler = (data: string) => {
        if (data.includes('password:') && passwordsSent < maxPasswords) {
          passwordsSent++;
          if (passwordsSent === 1 && jumpPassword) {
            console.log('Sending jump host password...');
            sshProcess.write(jumpPassword + '\n');
          } else if (password) {
            console.log('Sending target host password...');
            sshProcess.write(password + '\n');
          }
        }
      };

      sshProcess.onData(passwordHandler);
    }

    return sshProcess;
  }

  disconnect(hostId: string): void {
    const conn = this.connections.get(hostId);
    if (conn) {
      if (conn.reconnectTimeout) {
        clearTimeout(conn.reconnectTimeout);
        conn.reconnectTimeout = undefined;
      }

      // Clean up native SSH process if exists
      if (conn.nativeSshProcess) {
        conn.nativeSshProcess.kill();
        conn.nativeSshProcess = undefined;
      }

      // Clean up jump client if exists
      if (conn.jumpClient) {
        conn.jumpClient.removeAllListeners();
        conn.jumpClient.end();
        conn.jumpClient = undefined;
      }

      conn.client.removeAllListeners();
      conn.client.end();
      this.connections.delete(hostId);
      console.log(`Disconnected from ${hostId}`);
    }
  }

  disconnectAll(): void {
    for (const hostId of this.connections.keys()) {
      this.disconnect(hostId);
    }
  }

  isConnected(hostId: string): boolean {
    return this.connections.get(hostId)?.connected ?? false;
  }

  getConnectionStatus(): Map<string, { connected: boolean; error?: string; reconnectAttempts?: number; lastDisconnectTime?: number }> {
    const status = new Map<string, { connected: boolean; error?: string; reconnectAttempts?: number; lastDisconnectTime?: number }>();
    for (const [id, conn] of this.connections) {
      status.set(id, {
        connected: conn.connected,
        error: conn.lastError,
        reconnectAttempts: conn.reconnectAttempts,
        lastDisconnectTime: conn.lastDisconnectTime
      });
    }
    return status;
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  private notifyListeners(hostId: string, connected: boolean, error?: string): void {
    for (const listener of this.connectionListeners) {
      listener(hostId, connected, error);
    }
  }

  getAllConfiguredHosts(): SSHHostConfig[] {
    return getAllHosts();
  }

  /**
   * Enable or disable native SSH for jump host connections.
   * When enabled (default), uses native ssh command with -J flag.
   * When disabled, uses ssh2 library's forwardOut method.
   */
  setUseNativeSshForJumpHosts(enabled: boolean): void {
    this.useNativeSshForJumpHosts = enabled;
    console.log(`Native SSH for jump hosts: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current native SSH setting
   */
  getUseNativeSshForJumpHosts(): boolean {
    return this.useNativeSshForJumpHosts;
  }

  /**
   * Test connection directly with a host config (without saving to disk)
   */
  async testConnectionDirect(config: SSHHostConfig): Promise<{ success: boolean; error?: string; message?: string }> {
    // For jump host connections, prefer native SSH which uses system ssh-agent
    if (config.jumpHost) {
      try {
        const nativeResult = await this.testConnectionNative(config);
        if (nativeResult.success) {
          return nativeResult;
        }
        console.log('Native SSH test failed, falling back to ssh2:', nativeResult.error);
      } catch (err) {
        console.log('Native SSH test error, falling back to ssh2:', err);
      }
    }

    const client = new Client();

    return new Promise((resolve) => {
      const timeoutDuration = config.jumpHost ? 30000 : 10000;
      const timeout = setTimeout(() => {
        client.end();
        resolve({
          success: false,
          error: `Connection timeout after ${timeoutDuration / 1000} seconds`,
        });
      }, timeoutDuration);

      client.on('ready', () => {
        clearTimeout(timeout);
        client.end();
        resolve({
          success: true,
          message: 'Connection successful',
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.end();
        resolve({
          success: false,
          error: err.message,
        });
      });

      try {
        const connectConfig = this.buildConnectConfig(config);

        if (config.jumpHost) {
          this.connectViaJumpHost(
            client,
            config,
            connectConfig,
            () => {
              clearTimeout(timeout);
              client.end();
              resolve({
                success: true,
                message: 'Connection successful via jump host',
              });
            },
            (err) => {
              clearTimeout(timeout);
              client.end();
              resolve({
                success: false,
                error: err.message,
              });
            }
          );
        } else {
          client.connect(connectConfig);
        }
      } catch (err) {
        clearTimeout(timeout);
        client.end();
        resolve({
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Test connection using native SSH command (supports system ssh-agent and config)
   */
  async testConnectionNative(config: SSHHostConfig): Promise<{ success: boolean; error?: string; message?: string }> {
    console.log('[testConnectionNative] Starting native SSH test for:', config.hostname);
    return new Promise((resolve) => {
      try {
        const args: string[] = [];

      // Add jump host if configured
      if (config.jumpHost) {
        const jumpConfig = config.jumpHost;
        args.push('-J', `${jumpConfig.username}@${jumpConfig.hostname}:${jumpConfig.port}`);
      }

      // Target host connection
      args.push(`${config.username}@${config.hostname}`);
      args.push('-p', String(config.port));
      args.push('-o', 'StrictHostKeyChecking=no');
      args.push('-o', 'UserKnownHostsFile=/dev/null');
      args.push('-o', 'ConnectTimeout=10');

      // Add target host private key
      if (config.privateKeyPath && existsSync(config.privateKeyPath)) {
        args.push('-i', config.privateKeyPath);
      }

      // Add jump host private key
      if (config.jumpHost?.privateKeyPath && existsSync(config.jumpHost.privateKeyPath)) {
        args.push('-i', config.jumpHost.privateKeyPath);
      }

      // Just run 'echo ok' to test connection
      args.push('echo', 'connection_test_ok');

      console.log(`Testing native SSH: ssh ${args.join(' ')}`);

      const timeout = config.jumpHost ? 30000 : 10000;
      let timeoutHandle: NodeJS.Timeout | undefined;
      let completed = false;

      const sshProcess = pty.spawn('ssh', args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || '/',
        env: process.env as { [key: string]: string },
      });

      let output = '';

      timeoutHandle = setTimeout(() => {
        if (!completed) {
          completed = true;
          sshProcess.kill();
          resolve({
            success: false,
            error: `Connection timeout after ${timeout / 1000} seconds`,
          });
        }
      }, timeout);

      // Handle password authentication
      const password = this.resolvePassword(config);
      const jumpPassword = config.jumpHost?.password;

      if (password || jumpPassword) {
        let passwordsSent = 0;
        const maxPasswords = (jumpPassword ? 1 : 0) + (password ? 1 : 0);

        let lastPasswordTime = 0;

        const handleData = (data: string) => {
          output += data;

          // Check for authentication failure
          if (data.includes('Permission denied') || data.includes('Authentication failed')) {
            console.log('Authentication failed detected');
          }

          // Check for password prompt with debounce (wait 500ms between password sends)
          const now = Date.now();
          if ((data.toLowerCase().includes('password:') || data.includes('Password:')) &&
              passwordsSent < maxPasswords &&
              (now - lastPasswordTime) > 500) {
            passwordsSent++;
            lastPasswordTime = now;

            // Add small delay before sending password to ensure SSH is ready
            setTimeout(() => {
              if (passwordsSent === 1 && jumpPassword) {
                console.log('Sending jump host password...');
                sshProcess.write(jumpPassword + '\n');
              } else if (password) {
                console.log('Sending target host password...');
                sshProcess.write(password + '\n');
              }
            }, 100);
          }

          // Check for success
          if (output.includes('connection_test_ok')) {
            if (!completed) {
              completed = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              sshProcess.kill();
              resolve({
                success: true,
                message: 'Connection successful',
              });
            }
          }
        };

        sshProcess.onData(handleData);
      } else {
        // Original onData handler for no-password case
        sshProcess.onData((data) => {
          output += data;
          if (output.includes('connection_test_ok')) {
            if (!completed) {
              completed = true;
              if (timeoutHandle) clearTimeout(timeoutHandle);
              sshProcess.kill();
              resolve({
                success: true,
                message: 'Connection successful',
              });
            }
          }
        });
      }

      sshProcess.onExit(({ exitCode }) => {
        if (!completed) {
          completed = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (exitCode === 0) {
            resolve({
              success: true,
              message: 'Connection successful',
            });
          } else {
            resolve({
              success: false,
              error: output.includes('Permission denied')
                ? 'Authentication failed'
                : `SSH exited with code ${exitCode}: ${output.slice(-200)}`,
            });
          }
        }
      });
      } catch (err) {
        console.error('[testConnectionNative] Error:', err);
        resolve({
          success: false,
          error: `Native SSH error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });
  }
}

export const sshConnectionManager = new SSHConnectionManager();
