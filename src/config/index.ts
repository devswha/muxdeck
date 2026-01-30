import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface ServerConfig {
  port: number;
  host: string;
}

export interface WebSocketConfig {
  path: string;
  heartbeatInterval: number;
}

export interface DiscoveryConfig {
  pollInterval: number;
  includeNonClaude: boolean;
}

export interface AuthConfig {
  enabled: boolean;
  secret: string;
  tokenExpiry: number;
  username: string;
  passwordHash: string;
}

export interface AppConfig {
  server: ServerConfig;
  websocket: WebSocketConfig;
  discovery: DiscoveryConfig;
  auth: AuthConfig;
}

const DEFAULT_CONFIG: AppConfig = {
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  websocket: {
    path: '/ws',
    heartbeatInterval: 30000,
  },
  discovery: {
    pollInterval: 2000,
    includeNonClaude: false,
  },
  auth: {
    enabled: false,
    secret: 'change-this-secret-in-production',
    tokenExpiry: 86400,
    username: 'admin',
    passwordHash: '',
  },
};

const CONFIG_PATHS = [
  join(process.cwd(), 'config', 'config.json'),
  join(homedir(), '.config', 'session-manager', 'config.json'),
];

function loadConfigFile(): Partial<AppConfig> {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        console.log(`Loaded config from ${configPath}`);
        return JSON.parse(content);
      } catch (err) {
        console.error(`Failed to load config from ${configPath}:`, err);
      }
    }
  }
  return {};
}

function loadEnvConfig(): Partial<AppConfig> {
  const config: Partial<AppConfig> = {};

  // Server config
  if (process.env.PORT) {
    config.server = config.server || {} as ServerConfig;
    config.server.port = parseInt(process.env.PORT, 10);
  }
  if (process.env.HOST) {
    config.server = config.server || {} as ServerConfig;
    config.server.host = process.env.HOST;
  }

  // Discovery config
  if (process.env.DISCOVERY_INTERVAL) {
    config.discovery = config.discovery || {} as DiscoveryConfig;
    config.discovery.pollInterval = parseInt(process.env.DISCOVERY_INTERVAL, 10);
  }

  // Auth config
  if (process.env.AUTH_ENABLED) {
    config.auth = config.auth || {} as AuthConfig;
    config.auth.enabled = process.env.AUTH_ENABLED === 'true';
  }
  if (process.env.AUTH_SECRET) {
    config.auth = config.auth || {} as AuthConfig;
    config.auth.secret = process.env.AUTH_SECRET;
  }
  if (process.env.AUTH_TOKEN_EXPIRY) {
    config.auth = config.auth || {} as AuthConfig;
    config.auth.tokenExpiry = parseInt(process.env.AUTH_TOKEN_EXPIRY, 10);
  }
  if (process.env.AUTH_USERNAME) {
    config.auth = config.auth || {} as AuthConfig;
    config.auth.username = process.env.AUTH_USERNAME;
  }
  if (process.env.AUTH_PASSWORD_HASH) {
    config.auth = config.auth || {} as AuthConfig;
    config.auth.passwordHash = process.env.AUTH_PASSWORD_HASH;
    config.auth.enabled = true;
  }

  return config;
}

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
        result[key] = deepMerge(
          (result[key] || {}) as object,
          source[key] as object
        ) as any;
      } else {
        result[key] = source[key] as any;
      }
    }
  }

  return result;
}

function validateConfig(config: AppConfig): void {
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Invalid port number');
  }
  if (config.discovery.pollInterval < 500) {
    throw new Error('Discovery poll interval must be at least 500ms');
  }
  if (config.auth.enabled && !config.auth.secret) {
    throw new Error('Auth secret is required when auth is enabled');
  }
  if (config.auth.enabled && !config.auth.passwordHash) {
    throw new Error('Auth password hash is required when auth is enabled');
  }
}

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const fileConfig = loadConfigFile();
  const envConfig = loadEnvConfig();

  // Priority: env > file > defaults
  let config = deepMerge(DEFAULT_CONFIG, fileConfig);
  config = deepMerge(config, envConfig);

  validateConfig(config);

  cachedConfig = config;
  return config;
}

export function getConfig(): AppConfig {
  return cachedConfig || loadConfig();
}

export function reloadConfig(): AppConfig {
  cachedConfig = null;
  return loadConfig();
}
