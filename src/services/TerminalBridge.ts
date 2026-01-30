import * as pty from 'node-pty';
import { ClientChannel } from 'ssh2';
import { BridgeState, BridgeConfig, TerminalBridgeInfo } from '../types/Terminal.js';
import { sshConnectionManager } from './SSHConnectionManager.js';
import { sessionDiscoveryService } from './SessionDiscoveryService.js';

export interface TerminalBridge {
  id: string;
  sessionId: string;
  state: BridgeState;
  dimensions: { cols: number; rows: number };
  subscriberIds: Set<string>;
  lastError?: string;
  lastActivityAt: Date;
  ptyProcess: pty.IPty | null;
  sshChannel: ClientChannel | null;
  outputBuffer: string[];
  graceTimeout: NodeJS.Timeout | null;
  isRemote: boolean;
}

type OutputCallback = (sessionId: string, data: string) => void;
type StateCallback = (sessionId: string, state: BridgeState, error?: string) => void;

const BUFFER_MAX_LINES = 1000;
const GRACE_PERIOD_MS = 30000;

export class TerminalBridgeManager {
  private bridges: Map<string, TerminalBridge> = new Map();
  private onOutput: OutputCallback | null = null;
  private onStateChange: StateCallback | null = null;

  setOutputHandler(handler: OutputCallback): void {
    this.onOutput = handler;
  }

  setStateChangeHandler(handler: StateCallback): void {
    this.onStateChange = handler;
  }

  async subscribe(config: BridgeConfig, clientId: string): Promise<TerminalBridgeInfo> {
    let bridge = this.bridges.get(config.sessionId);

    if (bridge) {
      if (bridge.graceTimeout) {
        clearTimeout(bridge.graceTimeout);
        bridge.graceTimeout = null;
      }

      bridge.subscriberIds.add(clientId);

      if (bridge.state === 'paused') {
        bridge.state = 'connected';
        this.onStateChange?.(config.sessionId, bridge.state);
      }

      return this.getBridgeInfo(bridge);
    }

    // Determine if session is remote
    const session = sessionDiscoveryService.getSession(config.sessionId);
    const isRemote = session?.host.type === 'remote';

    bridge = {
      id: config.sessionId,
      sessionId: config.sessionId,
      state: 'initializing',
      dimensions: { cols: config.cols, rows: config.rows },
      subscriberIds: new Set([clientId]),
      lastActivityAt: new Date(),
      ptyProcess: null,
      sshChannel: null,
      outputBuffer: [],
      graceTimeout: null,
      isRemote,
    };

    this.bridges.set(config.sessionId, bridge);

    try {
      if (isRemote && session) {
        await this.createRemoteBridge(bridge, session.host.id, config.tmuxTarget);
      } else {
        this.createLocalBridge(bridge, config.tmuxTarget, config.cols, config.rows);
      }
    } catch (err) {
      bridge.state = 'error';
      bridge.lastError = err instanceof Error ? err.message : String(err);
      this.onStateChange?.(config.sessionId, 'error', bridge.lastError);
    }

    return this.getBridgeInfo(bridge);
  }

  private createLocalBridge(bridge: TerminalBridge, tmuxTarget: string, cols: number, rows: number): void {
    const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', tmuxTarget], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || '/',
      env: process.env as { [key: string]: string },
    });

    bridge.ptyProcess = ptyProcess;
    bridge.state = 'connected';

    ptyProcess.onData((data: string) => {
      bridge.lastActivityAt = new Date();

      bridge.outputBuffer.push(data);
      if (bridge.outputBuffer.length > BUFFER_MAX_LINES) {
        bridge.outputBuffer.shift();
      }

      this.onOutput?.(bridge.sessionId, data);
    });

    ptyProcess.onExit(() => {
      bridge.state = 'closed';
      this.onStateChange?.(bridge.sessionId, 'closed');
      this.bridges.delete(bridge.sessionId);
    });

    this.onStateChange?.(bridge.sessionId, 'connected');
  }

  private async createRemoteBridge(bridge: TerminalBridge, hostId: string, tmuxTarget: string): Promise<void> {
    const channel = await sshConnectionManager.shell(hostId);
    bridge.sshChannel = channel;
    bridge.state = 'connected';

    channel.on('data', (data: Buffer) => {
      bridge.lastActivityAt = new Date();
      const str = data.toString();

      bridge.outputBuffer.push(str);
      if (bridge.outputBuffer.length > BUFFER_MAX_LINES) {
        bridge.outputBuffer.shift();
      }

      this.onOutput?.(bridge.sessionId, str);
    });

    channel.stderr.on('data', (data: Buffer) => {
      const str = data.toString();
      this.onOutput?.(bridge.sessionId, str);
    });

    channel.on('close', () => {
      bridge.state = 'closed';
      this.onStateChange?.(bridge.sessionId, 'closed');
      this.bridges.delete(bridge.sessionId);
    });

    channel.on('error', (err: Error) => {
      bridge.state = 'error';
      bridge.lastError = err.message;
      this.onStateChange?.(bridge.sessionId, 'error', err.message);
    });

    // Attach to tmux session
    channel.write(`tmux attach-session -t "${tmuxTarget}"\n`);

    this.onStateChange?.(bridge.sessionId, 'connected');
  }

  unsubscribe(sessionId: string, clientId: string): void {
    const bridge = this.bridges.get(sessionId);
    if (!bridge) return;

    bridge.subscriberIds.delete(clientId);

    if (bridge.subscriberIds.size === 0) {
      bridge.state = 'paused';
      this.onStateChange?.(sessionId, 'paused');

      bridge.graceTimeout = setTimeout(() => {
        this.closeBridge(sessionId);
      }, GRACE_PERIOD_MS);
    }
  }

  sendInput(sessionId: string, data: string): void {
    const bridge = this.bridges.get(sessionId);
    if (!bridge || bridge.state !== 'connected') return;

    bridge.lastActivityAt = new Date();

    if (bridge.isRemote && bridge.sshChannel) {
      bridge.sshChannel.write(data);
    } else if (bridge.ptyProcess) {
      bridge.ptyProcess.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const bridge = this.bridges.get(sessionId);
    if (!bridge) return;

    bridge.dimensions = { cols, rows };

    if (bridge.isRemote && bridge.sshChannel) {
      bridge.sshChannel.setWindow(rows, cols, 0, 0);
    } else if (bridge.ptyProcess) {
      bridge.ptyProcess.resize(cols, rows);
    }
  }

  getBuffer(sessionId: string): string[] {
    return this.bridges.get(sessionId)?.outputBuffer || [];
  }

  closeBridge(sessionId: string): void {
    const bridge = this.bridges.get(sessionId);
    if (!bridge) return;

    if (bridge.graceTimeout) {
      clearTimeout(bridge.graceTimeout);
    }

    if (bridge.ptyProcess) {
      bridge.ptyProcess.kill();
    }

    if (bridge.sshChannel) {
      bridge.sshChannel.end();
    }

    bridge.state = 'closed';
    this.onStateChange?.(sessionId, 'closed');
    this.bridges.delete(sessionId);
  }

  closeAll(): void {
    for (const sessionId of this.bridges.keys()) {
      this.closeBridge(sessionId);
    }
  }

  private getBridgeInfo(bridge: TerminalBridge): TerminalBridgeInfo {
    return {
      id: bridge.id,
      sessionId: bridge.sessionId,
      state: bridge.state,
      dimensions: bridge.dimensions,
      subscriberCount: bridge.subscriberIds.size,
      lastError: bridge.lastError,
      lastActivityAt: bridge.lastActivityAt,
    };
  }

  getBridgeInfoAll(): TerminalBridgeInfo[] {
    return Array.from(this.bridges.values()).map(b => this.getBridgeInfo(b));
  }
}

export const terminalBridgeManager = new TerminalBridgeManager();
