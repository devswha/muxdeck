import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CreateSessionRequest, AttachSessionRequest } from '../types/Session.js';
import { sessionManager } from '../services/SessionManager.js';
import { sessionDiscoveryService } from '../services/SessionDiscoveryService.js';

export async function sessionRoutes(app: FastifyInstance) {
  // List all managed sessions (manually added by user)
  app.get('/api/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { claudeOnly } = request.query as { claudeOnly?: string };

    let sessions = sessionDiscoveryService.getManagedSessions();

    if (claudeOnly !== 'false') {
      sessions = sessions.filter(s => s.isClaudeSession && s.status !== 'terminated');
    }

    return { sessions };
  });

  // List available tmux sessions (not yet managed, for "Attach Existing" dropdown)
  app.get<{ Querystring: { hostId: string } }>('/api/sessions/available', async (request, reply) => {
    const { hostId } = request.query;

    if (!hostId) {
      reply.status(400);
      return { error: 'hostId query parameter is required' };
    }

    const availableSessions = await sessionDiscoveryService.getAvailableSessions(hostId);
    return { sessions: availableSessions };
  });

  // Get single session
  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const session = sessionDiscoveryService.getSession(request.params.id);

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    return { session };
  });

  // Create new session
  app.post<{ Body: CreateSessionRequest }>('/api/sessions', {
    schema: {
      body: {
        type: 'object',
        required: ['workingDirectory', 'hostId'],
        properties: {
          workingDirectory: { type: 'string', minLength: 1 },
          hostId: { type: 'string', minLength: 1 },
          sessionName: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
          claudeArgs: { type: 'array', items: { type: 'string' } },
          workspaceId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const session = await sessionManager.createSession(request.body);
      reply.status(201);
      return { session };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Attach to existing session
  app.post<{ Body: AttachSessionRequest }>('/api/sessions/attach', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionName', 'hostId'],
        properties: {
          sessionName: { type: 'string', minLength: 1 },
          hostId: { type: 'string', minLength: 1 },
          workspaceId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const session = await sessionManager.attachSession(request.body);

      // Set workspace if provided
      if (request.body.workspaceId) {
        sessionDiscoveryService.setSessionWorkspace(session.id, request.body.workspaceId);
      }

      reply.status(200);
      return { session };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Delete session
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    try {
      await sessionManager.killSession(request.params.id);
      reply.status(204);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        reply.status(404);
      } else {
        reply.status(500);
      }
      return { error: message };
    }
  });

  // PUT /api/sessions/:id/workspace - Reassign session to workspace
  app.put<{ Params: { id: string }; Body: { workspaceId: string | null } }>('/api/sessions/:id/workspace', async (request, reply) => {
    try {
      const { id } = request.params;
      const { workspaceId } = request.body;

      // Validate session exists
      const session = sessionDiscoveryService.getSession(id);
      if (!session) {
        reply.status(404);
        return { error: 'Session not found' };
      }

      // Check if session is managed
      if (!sessionDiscoveryService.isManagedSession(id)) {
        reply.status(400);
        return { error: 'Session is not managed' };
      }

      // Validate workspace exists (if provided)
      if (workspaceId) {
        const { WorkspaceStorage } = await import('../services/WorkspaceStorage.js');
        const workspaceStorage = new WorkspaceStorage();
        const workspace = await workspaceStorage.getById(workspaceId);
        if (!workspace) {
          reply.status(404);
          return { error: 'Workspace not found' };
        }
      }

      // Update mapping
      sessionDiscoveryService.setSessionWorkspace(id, workspaceId ?? null);

      // Return updated session
      const updatedSession = sessionDiscoveryService.getSession(id);
      return { session: updatedSession };
    } catch (error) {
      console.error('Failed to reassign session workspace:', error);
      reply.status(500);
      return { error: 'Failed to reassign session workspace' };
    }
  });
}
