import { FastifyInstance } from 'fastify';
import { LeaderboardService } from '../services/leaderboard.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';
import { AchievementService } from '../services/achievement.service.js';
import { ChallengeService } from '../services/challenge.service.js';
import { StreakService } from '../services/streak.service.js';

export async function leaderboardRoutes(fastify: FastifyInstance) {
  // Get walking distance leaderboard
  fastify.get<{ Querystring: { timeframe?: 'alltime' | 'week'; limit?: string } }>(
    '/walking',
    async (request, reply) => {
      const timeframe = request.query.timeframe || 'alltime';
      if (timeframe !== 'alltime' && timeframe !== 'week') return reply.status(400).send({ error: 'timeframe must be alltime or week.' });
      const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit || '25', 10) || 25));

      try {
        const rankings = await LeaderboardService.getWalkingLeaderboard(timeframe, limit);
        return reply.send({
          success: true,
          timeframe,
          count: rankings.length,
          leaderboard: rankings,
        });
      } catch (err: any) {
        request.log.error(err);
        return reply.status(500).send({ error: err.message || 'Failed to fetch leaderboard' });
      }
    }
  );

  // Sync daily step count
  fastify.post<{ Body: { userId: string; steps: number } }>('/steps', { preHandler: requireAuth }, async (request, reply) => {
    const { userId, steps } = request.body || {};
    if (!userId || !Number.isInteger(steps) || steps < 0 || steps > 200000) {
      return reply.status(400).send({ error: 'userId and integer steps between 0 and 200000 are required.' });
    }
    if (userId !== authenticatedUserId(request)) return reply.status(403).send({ error: 'userId must match the authenticated account.' });

    try {
      await LeaderboardService.recordSteps(userId, steps);
      await AchievementService.updateMetric(userId, 'steps', steps);
      await ChallengeService.refreshUser(userId);
      await StreakService.refresh(userId);
      return reply.send({ success: true, message: 'Step count updated in leaderboard' });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ error: err.message || 'Failed to record steps' });
    }
  });

  fastify.get<{ Querystring: { limit?: string } }>('/steps', { preHandler: requireAuth }, async (request, reply) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit || '25', 10) || 25));
    try {
      const leaderboard = await LeaderboardService.getStepsLeaderboard(limit);
      return reply.send({ success: true, count: leaderboard.length, leaderboard });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ error: err.message || 'Failed to fetch steps leaderboard' });
    }
  });
}
