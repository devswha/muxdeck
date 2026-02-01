// Host type from the backend API
export interface Host {
  id: string;
  name: string;
  type: 'local' | 'ssh';
  hostname?: string;  // IP address or hostname for SSH hosts
  connected?: boolean;
}

// For display in the workspace info panel
export interface HostInfo {
  id: string;
  displayName: string;
  address: string;  // "Local" or the hostname/IP
  type: 'local' | 'ssh';
}

// Helper function to convert Host to HostInfo for display
export function toHostInfo(host: Host): HostInfo {
  return {
    id: host.id,
    displayName: host.name,
    address: host.type === 'local' ? 'Local Machine' : (host.hostname || 'Unknown'),
    type: host.type,
  };
}
