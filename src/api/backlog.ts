import { FastifyInstance } from 'fastify';
import { backlogService } from '../services/BacklogService.js';
import { CreateBacklogItemRequest, UpdateBacklogItemRequest, BacklogStatus } from '../types/Backlog.js';

export async function backlogRoutes(app: FastifyInstance) {
  // Get all backlog items
  app.get('/api/backlog', async (request) => {
    const { status } = request.query as { status?: BacklogStatus };
    return backlogService.getAll(status);
  });

  // Get backlog stats
  app.get('/api/backlog/stats', async () => {
    return backlogService.getStats();
  });

  // Export as markdown
  app.get('/api/backlog/export', async () => {
    return { markdown: backlogService.exportMarkdown() };
  });

  // Get single item
  app.get('/api/backlog/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = backlogService.getById(id);
    if (!item) {
      return reply.status(404).send({ error: 'Backlog item not found' });
    }
    return item;
  });

  // Create new item
  app.post('/api/backlog', async (request) => {
    const body = request.body as CreateBacklogItemRequest;
    return backlogService.create(body);
  });

  // Update item
  app.put('/api/backlog/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateBacklogItemRequest;
    const item = backlogService.update(id, body);
    if (!item) {
      return reply.status(404).send({ error: 'Backlog item not found' });
    }
    return item;
  });

  // Delete item
  app.delete('/api/backlog/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = backlogService.delete(id);
    if (!success) {
      return reply.status(404).send({ error: 'Backlog item not found' });
    }
    return { success: true };
  });
}
