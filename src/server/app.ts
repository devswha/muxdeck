import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createServer } from 'http';
import { webSocketServer } from './WebSocketServer.js';
import { sessionDiscoveryService } from '../services/SessionDiscoveryService.js';
import { sessionRoutes } from '../api/sessions.js';
import { authRoutes } from '../api/auth.js';
import { hostRoutes } from '../api/hosts.js';
import { workspaceRoutes } from '../api/workspaces.js';
import { todoRoutes } from '../api/todos.js';
import { backlogRoutes } from '../api/backlog.js';
import { authMiddleware } from '../middleware/auth.js';
import { getConfig } from '../config/index.js';

export async function createApp() {
  const app = Fastify({ logger: true });
  const config = getConfig();

  // CORS configuration
  await app.register(cors, {
    origin: [
      'http://localhost:5174',
      'http://localhost:5176',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5176',
      'http://100.98.23.106:5175',
      'http://100.98.23.106:5176',
      'http://172.19.133.25:5176',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Auth middleware (skips if auth disabled)
  app.addHook('preHandler', authMiddleware);

  // Root endpoint
  app.get('/', async () => ({
    name: 'session-manager',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      sessions: '/api/sessions',
      workspaces: '/api/workspaces',
      hosts: '/api/hosts',
      websocket: '/ws',
    },
  }));

  // Health check endpoint
  app.get('/health', async () => ({ status: 'ok' }));

  // Register routes
  await authRoutes(app);
  await workspaceRoutes(app);
  await sessionRoutes(app);
  await hostRoutes(app);
  await todoRoutes(app);
  await backlogRoutes(app);

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
      code: error.code || 'INTERNAL_ERROR',
    });
  });

  return app;
}

export async function startServer(port: number = 3000) {
  const app = await createApp();
  const config = getConfig();

  await app.ready();
  const httpServer = createServer((req, res) => {
    app.routing(req, res);
  });

  // Initialize WebSocket server
  webSocketServer.initialize(httpServer);

  // Enable polling to refresh sessions with status bar and last output
  sessionDiscoveryService.startPolling(config.discovery.pollInterval);

  return new Promise<void>((resolve, reject) => {
    httpServer.listen(port, config.server.host, () => {
      console.log(`Server running on http://${config.server.host}:${port}`);
      console.log(`WebSocket server running on ws://${config.server.host}:${port}/ws`);
      resolve();
    });
    httpServer.on('error', reject);
  });
}
