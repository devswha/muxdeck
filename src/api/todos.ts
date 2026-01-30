import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TodoStorage } from '../services/TodoStorage.js';
import type { CreateTodoRequest, UpdateTodoRequest } from '../types/Todo.js';

const todoStorage = new TodoStorage();

export async function todoRoutes(app: FastifyInstance) {
  // GET /api/workspaces/:workspaceId/todos - List todos for workspace
  app.get<{ Params: { workspaceId: string } }>('/api/workspaces/:workspaceId/todos', async (request, reply) => {
    try {
      const { workspaceId } = request.params;
      const todos = await todoStorage.getByWorkspace(workspaceId);
      return { todos };
    } catch (err) {
      reply.status(500);
      return {
        error: err instanceof Error ? err.message : 'Failed to retrieve todos'
      };
    }
  });

  // POST /api/workspaces/:workspaceId/todos - Create todo in workspace
  app.post<{ Params: { workspaceId: string }; Body: CreateTodoRequest }>('/api/workspaces/:workspaceId/todos', {
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { workspaceId } = request.params;
      const { text } = request.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        reply.status(400);
        return { error: 'Text is required and cannot be empty' };
      }

      const todo = await todoStorage.create(workspaceId, { text });
      reply.status(201);
      return { todo };
    } catch (err) {
      reply.status(400);
      return {
        error: err instanceof Error ? err.message : 'Failed to create todo'
      };
    }
  });

  // PUT /api/workspaces/:workspaceId/todos/:todoId - Update todo
  app.put<{ Params: { workspaceId: string; todoId: string }; Body: UpdateTodoRequest }>('/api/workspaces/:workspaceId/todos/:todoId', {
    schema: {
      body: {
        type: 'object',
        properties: {
          text: { type: 'string', minLength: 1 },
          completed: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { workspaceId, todoId } = request.params;
      const { text, completed } = request.body;

      if (text !== undefined && (!text || text.trim().length === 0)) {
        reply.status(400);
        return { error: 'Text cannot be empty' };
      }

      const todo = await todoStorage.update(workspaceId, todoId, { text, completed });

      if (!todo) {
        reply.status(404);
        return { error: 'Todo not found' };
      }

      return { todo };
    } catch (err) {
      reply.status(400);
      return {
        error: err instanceof Error ? err.message : 'Failed to update todo'
      };
    }
  });

  // DELETE /api/workspaces/:workspaceId/todos/:todoId - Delete todo
  app.delete<{ Params: { workspaceId: string; todoId: string } }>('/api/workspaces/:workspaceId/todos/:todoId', async (request, reply) => {
    try {
      const { workspaceId, todoId } = request.params;
      const deleted = await todoStorage.delete(workspaceId, todoId);

      if (!deleted) {
        reply.status(404);
        return { error: 'Todo not found' };
      }

      return { success: true };
    } catch (err) {
      reply.status(500);
      return {
        error: err instanceof Error ? err.message : 'Failed to delete todo'
      };
    }
  });
}
