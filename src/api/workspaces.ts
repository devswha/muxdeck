import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WorkspaceStorage } from '../services/WorkspaceStorage.js';
import { sessionDiscoveryService } from '../services/SessionDiscoveryService.js';
import type { CreateWorkspaceRequest, UpdateWorkspaceRequest } from '../types/Workspace.js';

const workspaceStorage = new WorkspaceStorage();

export async function workspaceRoutes(app: FastifyInstance) {
  // GET /api/workspaces - List all workspaces
  app.get('/api/workspaces', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const workspaces = await workspaceStorage.getAll();
      return { workspaces };
    } catch (err) {
      reply.status(500);
      return {
        error: err instanceof Error ? err.message : 'Failed to retrieve workspaces'
      };
    }
  });

  // GET /api/workspaces/:id - Get single workspace
  app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => {
    try {
      const workspace = await workspaceStorage.getById(request.params.id);

      if (!workspace) {
        reply.status(404);
        return { error: 'Workspace not found' };
      }

      return { workspace };
    } catch (err) {
      reply.status(500);
      return {
        error: err instanceof Error ? err.message : 'Failed to retrieve workspace'
      };
    }
  });

  // POST /api/workspaces - Create workspace
  app.post<{ Body: CreateWorkspaceRequest }>('/api/workspaces', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 50 },
          description: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, description } = request.body;

      if (!name || typeof name !== 'string') {
        reply.status(400);
        return { error: 'Name is required' };
      }

      if (name.length > 50) {
        reply.status(400);
        return { error: 'Name must be 50 characters or less' };
      }

      const workspace = await workspaceStorage.create({ name, description });
      reply.status(201);
      return { workspace };
    } catch (err) {
      reply.status(400);
      return {
        error: err instanceof Error ? err.message : 'Failed to create workspace'
      };
    }
  });

  // PUT /api/workspaces/:id - Update workspace
  app.put<{ Params: { id: string }; Body: UpdateWorkspaceRequest }>('/api/workspaces/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 50 },
          description: { type: 'string' },
          hidden: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, description, hidden } = request.body;

      if (name && name.length > 50) {
        reply.status(400);
        return { error: 'Name must be 50 characters or less' };
      }

      const workspace = await workspaceStorage.update(request.params.id, { name, description, hidden });

      if (!workspace) {
        reply.status(404);
        return { error: 'Workspace not found' };
      }

      return { workspace };
    } catch (err) {
      reply.status(400);
      return {
        error: err instanceof Error ? err.message : 'Failed to update workspace'
      };
    }
  });

  // DELETE /api/workspaces/:id - Delete workspace
  app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      // Get all sessions in this workspace and set their workspaceId to null
      const sessionIds = sessionDiscoveryService.getSessionsInWorkspace(id);
      for (const sessionId of sessionIds) {
        sessionDiscoveryService.setSessionWorkspace(sessionId, null);
      }

      // Delete the workspace
      const deleted = await workspaceStorage.delete(id);

      if (!deleted) {
        reply.status(404);
        return { error: 'Workspace not found' };
      }

      return { success: true, movedSessions: sessionIds.length };
    } catch (err) {
      reply.status(500);
      return {
        error: err instanceof Error ? err.message : 'Failed to delete workspace'
      };
    }
  });
}
