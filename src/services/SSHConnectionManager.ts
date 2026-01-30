import { Client, ConnectConfig, ClientChannel } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { SSHHostConfig, getHostConfig, getAllHosts, JumpHostConfig } from '../config/hosts.js';

interface SSHConnection {
  client: Client;
  hostId: string;
  connected: boolean;
  lastError?: string;
  reconnectTimeout?: NodeJS.Timeout;
}

type ConnectionCallback = (hostId: string, connected: boolean, error?: string) => void;

export class SSHConnectionManager {
  private connections: Map<string, SSHConnection> = new Map();
  private connectionListeners: Set<ConnectionCallback> = new Set();

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
    const jumpConfig = hostConfig.jumpHost!;
    const jumpClient = new Client();

    const jumpConnectConfig: ConnectConfig = {
      host: jumpConfig.hostname,
      port: jumpConfig.port,
      username: jumpConfig.username,
      agent: process.env.SSH_AUTH_SOCK,
    };

    if (existsSync(jumpConfig.privateKeyPath)) {
      jumpConnectConfig.privateKey = readFileSync(jumpConfig.privateKeyPath);
    }

    const jumpPassphrase = this.resolvePassphrase(jumpConfig);
    if (jumpPassphrase) {
      jumpConnectConfig.passphrase = jumpPassphrase;
    }

    jumpClient.on('ready', () => {
      console.log(`Jump host connected: ${jumpConfig.hostname}`);

      jumpClient.forwardOut(
        '127.0.0.1',
        0,
        hostConfig.hostname,
        hostConfig.port,
        (err, stream) => {
          if (err) {
            jumpClient.end();
            reject(err);
            return;
          }

          targetClient.connect({
            ...targetConfig,
            sock: stream,
          });
        }
      );
    });

    jumpClient.on('error', (err) => {
      reject(new Error(`Jump host error: ${err.message}`));
    });

    jumpClient.connect(jumpConnectConfig);
  }

  private scheduleReconnect(hostId: string): void {
    const conn = this.connections.get(hostId);
    if (!conn || conn.reconnectTimeout) return;

    conn.reconnectTimeout = setTimeout(async () => {
      conn.reconnectTimeout = undefined;
      try {
        await this.connect(hostId);
      } catch (err) {
        // Will retry on next scheduleReconnect
        this.scheduleReconnect(hostId);
      }
    }, 5000);
  }

  async exec(hostId: string, command: string): Promise<string> {
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

  async shell(hostId: string): Promise<ClientChannel> {
    const client = await this.connect(hostId);

    return new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color' }, (err, stream) => {
        if (err) reject(err);
        else resolve(stream);
      });
    });
  }

  disconnect(hostId: string): void {
    const conn = this.connections.get(hostId);
    if (conn) {
      if (conn.reconnectTimeout) {
        clearTimeout(conn.reconnectTimeout);
      }
      conn.client.end();
      this.connections.delete(hostId);
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

  getConnectionStatus(): Map<string, { connected: boolean; error?: string }> {
    const status = new Map<string, { connected: boolean; error?: string }>();
    for (const [id, conn] of this.connections) {
      status.set(id, { connected: conn.connected, error: conn.lastError });
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
   * Test connection directly with a host config (without saving to disk)
   */
  async testConnectionDirect(config: SSHHostConfig): Promise<{ success: boolean; error?: string; message?: string }> {
    const client = new Client();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.end();
        resolve({
          success: false,
          error: 'Connection timeout after 10 seconds',
        });
      }, 10000);

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
}

export const sshConnectionManager = new SSHConnectionManager();
