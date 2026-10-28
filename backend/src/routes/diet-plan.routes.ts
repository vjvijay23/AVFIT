import { FastifyInstance } from 'fastify';
import { DietPlanService } from '../services/diet-plan.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

export async function dietPlanRoutes(app: FastifyInstance) {
  app.get('/latest', { preHandler: requireAuth }, async (request) => ({
    success: true,
    plan: await DietPlanService.latest(authenticatedUserId(request)),
  }));

  app.post<{ Body: { focus?: string } }>('/generate', { preHandler: requireAuth }, async (request, reply) => {
    const focus = request.body?.focus;
    if (focus !== undefined && (typeof focus !== 'string' || focus.trim().length > 300)) {
      return reply.status(400).send({ error: 'focus must be text up to 300 characters.' });
    }
    try {
      return reply.send({ success: true, plan: await DietPlanService.generate(authenticatedUserId(request), focus?.trim()) });
    } catch (err: any) {
      request.log.error(err);
      const statusCode = [409, 503].includes(err?.statusCode) ? err.statusCode : 502;
      return reply.status(statusCode).send({ error: statusCode === 502 ? 'Gemini could not generate a valid diet plan. Please try again.' : err.message });
    }
  });
}
