import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { authService } from '../services/AuthService.js';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth if disabled
  if (!authService.isEnabled()) {
    return;
  }

  // Skip auth for login endpoint
  if (request.url === '/api/auth/login') {
    return;
  }

  // Skip auth for health check
  if (request.url === '/health') {
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const payload = authService.verifyToken(token);
    (request as any).user = payload;
  } catch (err) {
    reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

export function extractTokenFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.searchParams.get('token');
  } catch {
    return null;
  }
}
