import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/AuthService.js';

interface LoginBody {
  username: string;
  password: string;
}

export async function authRoutes(app: FastifyInstance) {
  // Login endpoint
  app.post<{ Body: LoginBody }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        }
      }
    }
  }, async (request, reply) => {
    const { username, password } = request.body;

    const valid = await authService.validateCredentials(username, password);

    if (!valid) {
      reply.status(401);
      return { error: 'Invalid credentials' };
    }

    const response = authService.generateToken(username);
    return response;
  });

  // Token refresh endpoint
  app.post('/api/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401);
      return { error: 'Missing authorization header' };
    }

    const token = authHeader.substring(7);

    try {
      const payload = authService.verifyToken(token);
      const response = authService.generateToken(payload.sub);
      return response;
    } catch (err) {
      reply.status(401);
      return { error: 'Invalid token' };
    }
  });

  // Check auth status
  app.get('/api/auth/status', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      enabled: authService.isEnabled(),
      user: (request as any).user?.sub || null,
    };
  });
}
