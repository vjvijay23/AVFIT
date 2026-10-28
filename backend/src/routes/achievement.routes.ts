import { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import { AchievementService } from '../services/achievement.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

export async function achievementRoutes(app: FastifyInstance) {
  app.get('/catalog', async () => {
    const result = await pool.query('SELECT * FROM achievement_definitions ORDER BY category,target_value');
    return { success: true, count: result.rows.length, achievements: result.rows };
  });
  app.get('/me', { preHandler: requireAuth }, async (request) => ({ success: true, ...(await AchievementService.getForUser(authenticatedUserId(request))) }));
}
