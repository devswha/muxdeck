import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { SSHHostConfig, HostsConfig, loadHostsConfig } from '../config/hosts.js';
import { sshConnectionManager } from './SSHConnectionManager.js';

const CONFIG_PATH = process.cwd() + '/config/hosts.json';

export class HostConfigService {
  /**
   * Add a new SSH host configuration
   */
  async addHost(config: SSHHostConfig): Promise<void> {
    const hostsConfig = loadHostsConfig();

    // Validate unique ID
    if (hostsConfig.hosts.find(h => h.id === config.id)) {
      throw new Error(`Host with ID '${config.id}' already exists`);
    }

    // Validate required fields
    this.validateHostConfig(config);

    hostsConfig.hosts.push(config);
    this.saveConfig(hostsConfig);
  }

  /**
   * Update an existing SSH host configuration
   */
  async updateHost(id: string, updates: Partial<SSHHostConfig>): Promise<void> {
    const hostsConfig = loadHostsConfig();
    const hostIndex = hostsConfig.hosts.findIndex(h => h.id === id);

    if (hostIndex === -1) {
      throw new Error(`Host with ID '${id}' not found`);
    }

    // Don't allow changing the ID
    if (updates.id && updates.id !== id) {
      throw new Error('Cannot change host ID');
    }

    const updatedHost = { ...hostsConfig.hosts[hostIndex], ...updates };
    this.validateHostConfig(updatedHost);

    hostsConfig.hosts[hostIndex] = updatedHost;
    this.saveConfig(hostsConfig);

    // Disconnect existing connection to force reconnect with new config
    if (sshConnectionManager.isConnected(id)) {
      sshConnectionManager.disconnect(id);
    }
  }

  /**
   * Delete an SSH host configuration
   */
  async deleteHost(id: string): Promise<void> {
    const hostsConfig = loadHostsConfig();
    const hostIndex = hostsConfig.hosts.findIndex(h => h.id === id);

    if (hostIndex === -1) {
      throw new Error(`Host with ID '${id}' not found`);
    }

    hostsConfig.hosts.splice(hostIndex, 1);
    this.saveConfig(hostsConfig);

    // Disconnect if connected
    if (sshConnectionManager.isConnected(id)) {
      sshConnectionManager.disconnect(id);
    }
  }

  /**
   * Test SSH connection to a host
   */
  async testConnection(config: SSHHostConfig): Promise<{ success: boolean; error?: string }> {
    // Use the direct connection test method that doesn't require saving to disk
    return await sshConnectionManager.testConnectionDirect(config);
  }

  /**
   * Validate host configuration
   */
  private validateHostConfig(config: SSHHostConfig): void {
    const errors: string[] = [];

    if (!config.id || config.id.trim() === '') {
      errors.push('Host ID is required');
    }

    if (!config.name || config.name.trim() === '') {
      errors.push('Host name is required');
    }

    if (!config.hostname || config.hostname.trim() === '') {
      errors.push('Hostname is required');
    }

    if (!config.username || config.username.trim() === '') {
      errors.push('Username is required');
    }

    if (config.port && (config.port < 1 || config.port > 65535)) {
      errors.push('Port must be between 1 and 65535');
    }

    // Ensure port has a default value
    if (!config.port) {
      config.port = 22;
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Save configuration to disk
   */
  private saveConfig(config: HostsConfig): void {
    try {
      // Ensure config directory exists
      const configDir = dirname(CONFIG_PATH);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Write config file with formatting
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      throw new Error(`Failed to save configuration: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}

export const hostConfigService = new HostConfigService();
