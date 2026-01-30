import { FastifyInstance } from 'fastify';
import { getAllHosts } from '../config/hosts.js';

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
}
