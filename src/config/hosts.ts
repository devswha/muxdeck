import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface JumpHostConfig {
  hostname: string;
  port: number;
  username: string;
  privateKeyPath: string;
  passphrase?: string;
  passphraseEnvVar?: string;
}

export interface SSHHostConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  passwordEnvVar?: string;
  passphrase?: string;
  passphraseEnvVar?: string;
  useAgent?: boolean;
  jumpHost?: JumpHostConfig;
}

export interface HostsConfig {
  hosts: SSHHostConfig[];
}

const CONFIG_PATHS = [
  join(process.cwd(), 'config', 'hosts.json'),
  join(homedir(), '.config', 'session-manager', 'hosts.json'),
];

export function loadHostsConfig(): HostsConfig {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as HostsConfig;

        // Resolve home directory paths
        for (const host of config.hosts) {
          if (host.privateKeyPath) {
            host.privateKeyPath = resolvePath(host.privateKeyPath);
          }
          if (host.jumpHost) {
            host.jumpHost.privateKeyPath = resolvePath(host.jumpHost.privateKeyPath);
          }
        }

        console.log(`Loaded ${config.hosts.length} SSH hosts from ${configPath}`);
        return config;
      } catch (err) {
        console.error(`Failed to load hosts config from ${configPath}:`, err);
      }
    }
  }

  return { hosts: [] };
}

function resolvePath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

export function getHostConfig(hostId: string): SSHHostConfig | undefined {
  const config = loadHostsConfig();
  return config.hosts.find(h => h.id === hostId);
}

export function getAllHosts(): SSHHostConfig[] {
  return loadHostsConfig().hosts;
}
