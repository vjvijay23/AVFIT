import { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import { AchievementService } from '../services/achievement.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';
import { ChallengeService } from '../services/challenge.service.js';
import { StreakService } from '../services/streak.service.js';

export async function workoutRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { category?: string; difficulty?: string } }>('/', async (request) => {
    const result = await pool.query(`SELECT * FROM workouts WHERE ($1::text IS NULL OR category=$1) AND ($2::text IS NULL OR difficulty=$2) ORDER BY duration_minutes,title LIMIT 100`, [request.query.category || null, request.query.difficulty?.toLowerCase() || null]);
    return { success: true, count: result.rows.length, workouts: result.rows };
  });

  app.get<{ Querystring: { limit?: string } }>('/logs', { preHandler: requireAuth }, async (request) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit || '20', 10) || 20));
    const result = await pool.query('SELECT * FROM workout_logs WHERE user_id=$1 ORDER BY completed_at DESC LIMIT $2', [authenticatedUserId(request), limit]);
    return { success: true, count: result.rows.length, logs: result.rows };
  });

  app.post<{ Body: { workoutId?: string; durationSeconds: number; caloriesBurned?: number } }>('/complete', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authenticatedUserId(request);
    const duration = Number(request.body?.durationSeconds);
    if (!Number.isInteger(duration) || duration < 30 || duration > 86400) return reply.status(400).send({ error: 'durationSeconds must be between 30 and 86400.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let title = 'Workout';
      const weightResult = await client.query('SELECT weight_kg FROM fitness_profiles WHERE user_id=$1', [userId]);
      const userWeight = Number(weightResult.rows[0]?.weight_kg || 70);
      let calories = Math.round(5 * userWeight * (duration / 3600));
      if (request.body.workoutId) {
        const found = await client.query('SELECT title,est_calories_burned FROM workouts WHERE id=$1', [request.body.workoutId]);
        if (!found.rows[0]) { await client.query('ROLLBACK'); return reply.status(404).send({ error: 'Workout not found.' }); }
        title = found.rows[0].title;
        calories = found.rows[0].est_calories_burned || calories;
      }
      const inserted = await client.query(`INSERT INTO workout_logs(user_id,workout_id,workout_title,duration_seconds,calories_burned)
        VALUES($1,$2,$3,$4,$5) RETURNING *`, [userId,request.body.workoutId || null,title,duration,calories]);
      const count = await client.query('SELECT COUNT(*)::int count FROM workout_logs WHERE user_id=$1', [userId]);
      const weekly = await client.query(`SELECT COUNT(*)::int count FROM workout_logs WHERE user_id=$1 AND date_trunc('week',completed_at)=date_trunc('week',NOW())`, [userId]);
      const monthly = await client.query(`SELECT COUNT(*)::int count FROM workout_logs WHERE user_id=$1 AND date_trunc('month',completed_at)=date_trunc('month',NOW())`, [userId]);
      await client.query('COMMIT');
      const newlyUnlocked = await AchievementService.updateMetric(userId, 'workout_count', count.rows[0].count);
      await Promise.all([
        AchievementService.updateMetric(userId, 'workout_week_count', weekly.rows[0].count),
        AchievementService.updateMetric(userId, 'workout_month_count', monthly.rows[0].count),
      ]);
      await ChallengeService.refreshUser(userId);
      await StreakService.refresh(userId);
      return reply.status(201).send({ success: true, log: inserted.rows[0], newlyUnlocked });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  });
}
