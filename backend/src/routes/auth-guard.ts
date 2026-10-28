import { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'A valid bearer token is required.' });
  }
}

export function authenticatedUserId(request: FastifyRequest): string {
  const user = request.user as { id?: string };
  return user?.id || '';
}
