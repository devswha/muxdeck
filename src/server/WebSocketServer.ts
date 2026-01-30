import { WebSocket, WebSocketServer as WSServer } from 'ws';
import { IncomingMessage, Server } from 'http';
import { messageHandler } from './MessageHandler.js';
import { ClientMessage } from '../types/Protocol.js';
import { randomUUID } from 'crypto';

interface ExtendedWebSocket extends WebSocket {
  clientId: string;
  isAlive: boolean;
}

export class WebSocketServerManager {
  private wss: WSServer | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    this.wss = new WSServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.clientId = randomUUID();
      extWs.isAlive = true;

      console.log(`Client connected: ${extWs.clientId}`);

      messageHandler.handleConnection(ws, extWs.clientId);

      extWs.on('pong', () => {
        extWs.isAlive = true;
      });

      extWs.on('message', async (data) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          await messageHandler.handleMessage(ws, extWs.clientId, message);
        } catch (err) {
          console.error('Failed to parse message:', err);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      extWs.on('close', () => {
        console.log(`Client disconnected: ${extWs.clientId}`);
        messageHandler.handleDisconnection(ws, extWs.clientId);
      });

      extWs.on('error', (err) => {
        console.error(`WebSocket error for ${extWs.clientId}:`, err);
      });
    });

    // Heartbeat to detect dead connections
    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        const extWs = ws as ExtendedWebSocket;
        if (!extWs.isAlive) {
          return extWs.terminate();
        }
        extWs.isAlive = false;
        extWs.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
    });
  }

  broadcast(message: object): void {
    const data = JSON.stringify(message);
    this.wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  getConnectionCount(): number {
    return this.wss?.clients.size ?? 0;
  }
}

export const webSocketServer = new WebSocketServerManager();
