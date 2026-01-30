import { WebSocket } from 'ws';
import { ClientMessage, ServerMessage } from '../types/Protocol.js';
import { sessionDiscoveryService } from '../services/SessionDiscoveryService.js';
import { terminalBridgeManager } from '../services/TerminalBridge.js';

export class MessageHandler {
  private clientSubscriptions: Map<WebSocket, Set<string>> = new Map();

  constructor() {
    // Set up terminal bridge output handler
    terminalBridgeManager.setOutputHandler((sessionId, data) => {
      this.broadcastToSubscribers(sessionId, {
        type: 'output',
        sessionId,
        data,
      });
    });

    // Set up session discovery change handler
    sessionDiscoveryService.onSessionsChange((sessions) => {
      this.broadcastToAll({
        type: 'sessions',
        sessions,
      });
    });
  }

  handleConnection(ws: WebSocket, clientId: string): void {
    this.clientSubscriptions.set(ws, new Set());

    // Send initial sessions list (only managed sessions)
    const sessions = sessionDiscoveryService.getManagedSessions();
    this.send(ws, { type: 'sessions', sessions });
  }

  handleDisconnection(ws: WebSocket, clientId: string): void {
    const subscriptions = this.clientSubscriptions.get(ws);
    if (subscriptions) {
      for (const sessionId of subscriptions) {
        terminalBridgeManager.unsubscribe(sessionId, clientId);
      }
    }
    this.clientSubscriptions.delete(ws);
  }

  async handleMessage(ws: WebSocket, clientId: string, message: ClientMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'subscribe':
          await this.handleSubscribe(ws, clientId, message.sessionId);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(ws, clientId, message.sessionId);
          break;

        case 'input':
          this.handleInput(message.sessionId, message.data);
          break;

        case 'resize':
          this.handleResize(message.sessionId, message.cols, message.rows);
          break;

        case 'list-sessions':
          this.handleListSessions(ws);
          break;

        default:
          this.send(ws, { type: 'error', message: 'Unknown message type' });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.send(ws, { type: 'error', message: errorMessage });
    }
  }

  private async handleSubscribe(ws: WebSocket, clientId: string, sessionId: string): Promise<void> {
    const session = sessionDiscoveryService.getSession(sessionId);
    if (!session) {
      this.send(ws, { type: 'error', message: `Session not found: ${sessionId}`, code: 'SESSION_NOT_FOUND' });
      return;
    }

    // Subscribe to terminal bridge
    const tmuxTarget = `${session.tmux.sessionName}:${session.tmux.windowIndex}.${session.tmux.paneId.replace('%', '')}`;
    await terminalBridgeManager.subscribe({
      sessionId,
      tmuxTarget: session.tmux.sessionName, // Attach to session, not specific pane
      cols: session.dimensions.cols,
      rows: session.dimensions.rows,
    }, clientId);

    // Track subscription
    const subscriptions = this.clientSubscriptions.get(ws);
    subscriptions?.add(sessionId);

    // Send buffer
    const buffer = terminalBridgeManager.getBuffer(sessionId);
    if (buffer.length > 0) {
      this.send(ws, { type: 'buffer', sessionId, data: buffer });
    }
  }

  private handleUnsubscribe(ws: WebSocket, clientId: string, sessionId: string): void {
    terminalBridgeManager.unsubscribe(sessionId, clientId);
    const subscriptions = this.clientSubscriptions.get(ws);
    subscriptions?.delete(sessionId);
  }

  private handleInput(sessionId: string, data: string): void {
    terminalBridgeManager.sendInput(sessionId, data);
  }

  private handleResize(sessionId: string, cols: number, rows: number): void {
    terminalBridgeManager.resize(sessionId, cols, rows);
  }

  private handleListSessions(ws: WebSocket): void {
    const sessions = sessionDiscoveryService.getManagedSessions();
    this.send(ws, { type: 'sessions', sessions });
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToSubscribers(sessionId: string, message: ServerMessage): void {
    for (const [ws, subscriptions] of this.clientSubscriptions) {
      if (subscriptions.has(sessionId)) {
        this.send(ws, message);
      }
    }
  }

  broadcastToAll(message: ServerMessage): void {
    for (const [ws] of this.clientSubscriptions) {
      this.send(ws, message);
    }
  }
}

export const messageHandler = new MessageHandler();
