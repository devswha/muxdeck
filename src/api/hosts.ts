import { FastifyInstance } from 'fastify';
import { getAllHosts, SSHHostConfig } from '../config/hosts.js';
import { hostConfigService } from '../services/HostConfigService.js';

export async function hostRoutes(app: FastifyInstance) {
  // List all configured hosts (including local)
  app.get('/api/hosts', async () => {
    const sshHosts = getAllHosts();

    // Always include local as first option
    const hosts = [
      {
        id: 'local',
        name: 'Local',
        type: 'local',
        connected: true,
      },
      ...sshHosts.map(h => ({
        id: h.id,
        name: h.name,
        type: 'ssh',
        hostname: h.hostname,
        // connected status could be added later
      })),
    ];

    return { hosts };
  });

  // Add a new SSH host
  app.post<{ Body: SSHHostConfig }>('/api/hosts', async (request, reply) => {
    try {
      await hostConfigService.addHost(request.body);
      return { success: true, message: 'Host added successfully' };
    } catch (err) {
      reply.code(400);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to add host',
      };
    }
  });

  // Update an existing SSH host
  app.put<{ Params: { id: string }; Body: Partial<SSHHostConfig> }>(
    '/api/hosts/:id',
    async (request, reply) => {
      try {
        await hostConfigService.updateHost(request.params.id, request.body);
        return { success: true, message: 'Host updated successfully' };
      } catch (err) {
        reply.code(400);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update host',
        };
      }
    }
  );

  // Delete an SSH host
  app.delete<{ Params: { id: string } }>('/api/hosts/:id', async (request, reply) => {
    try {
      await hostConfigService.deleteHost(request.params.id);
      return { success: true, message: 'Host deleted successfully' };
    } catch (err) {
      reply.code(400);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete host',
      };
      }
  });

  // Test SSH connection
  app.post<{ Body: SSHHostConfig }>('/api/hosts/test', async (request, reply) => {
    try {
      const result = await hostConfigService.testConnection(request.body);
      return result;
    } catch (err) {
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to test connection',
      };
    }
  });
}
