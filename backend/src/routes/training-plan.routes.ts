import { FastifyInstance } from 'fastify';
import { TrainingRecommendationService } from '../services/training-recommendation.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

export async function trainingPlanRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { refresh?: string } }>('/today', { preHandler: requireAuth }, async (request, reply) => {
    try {
      return { success: true, recommendation: await TrainingRecommendationService.today(authenticatedUserId(request), request.query.refresh === 'true') };
    } catch (err: any) {
      const status = [409, 502, 503].includes(err?.statusCode) ? err.statusCode : 500;
      request.log.error({ err }, 'Training recommendation failed');
      return reply.status(status).send({ error: err?.message || 'Could not load a training suggestion.' });
    }
  });
}
