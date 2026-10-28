import { FastifyInstance } from 'fastify';
import { ActivityService, ActivityRecordPayload } from '../services/activity.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

export async function activityRoutes(fastify: FastifyInstance) {
  // Record completed walk/run with PostGIS geometry
  fastify.post<{ Body: ActivityRecordPayload }>('/record', { preHandler: requireAuth }, async (request, reply) => {
    const { userId, durationSec, distanceKm, calories, avgPace, routeCoordinates } = request.body;

    if (!userId || durationSec === undefined || distanceKm === undefined) {
      return reply.status(400).send({
        error: 'Missing required activity fields (userId, durationSec, distanceKm)',
      });
    }
    if (userId !== authenticatedUserId(request)) return reply.status(403).send({ error: 'userId must match the authenticated account.' });
    const coordinates = Array.isArray(routeCoordinates) ? routeCoordinates : [];
    if (!Number.isInteger(durationSec) || durationSec < 0 || durationSec > 86400 || !Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 500 || !Number.isInteger(calories) || calories < 0 || calories > 10000 || coordinates.length > 20000 || coordinates.some((point) => !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90 || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180)) {
      return reply.status(400).send({ error: 'Activity metrics or GPS coordinates are outside valid bounds.' });
    }

    try {
      const record = await ActivityService.recordActivity(request.body);
      return reply.status(201).send({
        success: true,
        message: 'Activity recorded successfully with PostGIS geometry',
        activity: record,
      });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ error: err.message || 'Failed to record activity' });
    }
  });

  // Get user activity history
  fastify.get<{ Params: { userId: string }; Querystring: { limit?: string } }>(
    '/user/:userId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { userId } = request.params;
      if (userId !== authenticatedUserId(request)) return reply.status(403).send({ error: 'You may only access your own activities.' });
      const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit || '20', 10) || 20));

      try {
        const activities = await ActivityService.getUserActivities(userId, limit);
        return reply.send({
          success: true,
          count: activities.length,
          activities,
        });
      } catch (err: any) {
        request.log.error(err);
        return reply.status(500).send({ error: err.message || 'Failed to fetch activities' });
      }
    }
  );

  // Get single activity with high-res GPS stream
  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params;
    try {
      const activity = await ActivityService.getActivityById(id);
      if (!activity) {
        return reply.status(404).send({ error: 'Activity not found' });
      }
      if (activity.user_id !== authenticatedUserId(request)) return reply.status(403).send({ error: 'You may only access your own activities.' });
      return reply.send({ success: true, activity });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ error: err.message || 'Failed to retrieve activity' });
    }
  });
}
