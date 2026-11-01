import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { AchievementService } from '../services/achievement.service.js';
import { ChallengeService } from '../services/challenge.service.js';
import { StreakService } from '../services/streak.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

const setSchema = z.object({
  setType: z.enum(['W', 'N', 'D', 'F']).default('N'),
  weightKg: z.number().finite().min(0).max(1500),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().finite().min(6).max(10).optional(),
  isCompleted: z.boolean().default(false),
});

const workoutSchema = z.object({
  name: z.string().trim().min(1).max(80),
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  exercises: z.array(z.object({
    exerciseId: z.string().uuid(),
    sets: z.array(setSchema).min(1).max(100),
  })).min(1).max(30),
});

type Bests = { estimated1rm: number; volume: number; weight: number };

export async function strengthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { equipment?: string } }>('/exercises', async (request, reply) => {
    const equipment = request.query.equipment;
    if (equipment && !['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'].includes(equipment)) {
      return reply.status(400).send({ error: 'Unsupported equipment filter.' });
    }
    const result = await pool.query(
      `SELECT id, slug, name, equipment, primary_muscle AS "primaryMuscle"
       FROM strength_exercises
       WHERE ($1::text IS NULL OR equipment = $1)
       ORDER BY equipment, name`,
      [equipment || null],
    );
    return { success: true, exercises: result.rows };
  });

  app.get<{ Params: { exerciseId: string } }>('/exercises/:exerciseId/history', { preHandler: requireAuth }, async (request, reply) => {
    const exerciseId = request.params.exerciseId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(exerciseId)) {
      return reply.status(400).send({ error: 'Invalid exercise ID.' });
    }
    const result = await pool.query(
      `WITH latest_workout AS (
         SELECT sw.id
         FROM strength_workouts sw
         JOIN strength_workout_exercises swe ON swe.workout_id = sw.id
         JOIN strength_sets ss ON ss.workout_exercise_id = swe.id
         WHERE sw.user_id=$1 AND swe.exercise_id=$2 AND ss.is_completed=TRUE AND ss.set_type <> 'W'
         ORDER BY sw.completed_at DESC
         LIMIT 1
       )
       SELECT ss.set_index AS "setIndex", ss.weight_kg AS "weightKg", ss.reps, ss.rpe
       FROM latest_workout lw
       JOIN strength_workout_exercises swe ON swe.workout_id = lw.id AND swe.exercise_id = $2
       JOIN strength_sets ss ON ss.workout_exercise_id = swe.id
       WHERE ss.is_completed=TRUE AND ss.set_type <> 'W'
       ORDER BY ss.set_index`,
      [authenticatedUserId(request), exerciseId],
    );
    return { success: true, sets: result.rows };
  });

  app.get<{ Querystring: { limit?: string } }>('/workouts', { preHandler: requireAuth }, async (request) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit || '20', 10) || 20));
    const result = await pool.query(
      `SELECT sw.id, sw.name, sw.started_at AS "startedAt", sw.completed_at AS "completedAt",
              sw.duration_seconds AS "durationSeconds", sw.total_volume_kg AS "totalVolumeKg",
              sw.calories_burned AS "caloriesBurned",
              COALESCE(json_agg(json_build_object('name', swe.exercise_name, 'sets',
                (SELECT COUNT(*)::int FROM strength_sets ss WHERE ss.workout_exercise_id = swe.id AND ss.is_completed))
                ORDER BY swe.order_index) FILTER (WHERE swe.id IS NOT NULL), '[]'::json) AS exercises
       FROM strength_workouts sw
       LEFT JOIN strength_workout_exercises swe ON swe.workout_id = sw.id
       WHERE sw.user_id = $1
       GROUP BY sw.id
       ORDER BY sw.completed_at DESC
       LIMIT $2`,
      [authenticatedUserId(request), limit],
    );
    return { success: true, workouts: result.rows };
  });

  app.post('/workouts', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = workoutSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid strength workout.', details: parsed.error.flatten() });

    const body = parsed.data;
    const startedAt = new Date(body.startedAt);
    const completedAt = new Date(body.completedAt);
    const durationSeconds = Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000);
    if (durationSeconds < 30 || durationSeconds > 86400) {
      return reply.status(400).send({ error: 'Workout duration must be between 30 seconds and 24 hours.' });
    }
    if (!body.exercises.some((exercise) => exercise.sets.some((set) => set.isCompleted))) {
      return reply.status(400).send({ error: 'Complete at least one set before saving.' });
    }

    const userId = authenticatedUserId(request);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const exerciseIds = [...new Set(body.exercises.map((exercise) => exercise.exerciseId))];
      const catalog = await client.query(
        'SELECT id, name FROM strength_exercises WHERE id = ANY($1::uuid[])',
        [exerciseIds],
      );
      const exercisesById = new Map(catalog.rows.map((exercise) => [exercise.id, exercise.name]));
      if (exercisesById.size !== exerciseIds.length) {
        await client.query('ROLLBACK');
        return reply.status(400).send({ error: 'One or more exercises are not in the catalog.' });
      }

      const weightResult = await client.query('SELECT weight_kg FROM fitness_profiles WHERE user_id=$1', [userId]);
      const userWeight = Number(weightResult.rows[0]?.weight_kg || 70);
      const caloriesBurned = Math.max(1, Math.round(5 * userWeight * (durationSeconds / 3600)));
      let totalVolumeKg = 0;
      const personalRecords: Array<{ exercise: string; metric: string; value: number }> = [];

      const bestByExercise = new Map<string, Bests>();
      for (const exerciseId of exerciseIds) {
        const prior = await client.query(
          `SELECT COALESCE(MAX(ss.estimated_1rm_kg), 0) AS best_1rm,
                  COALESCE(MAX(ss.volume_kg), 0) AS best_volume,
                  COALESCE(MAX(ss.weight_kg), 0) AS best_weight
           FROM strength_sets ss
           JOIN strength_workout_exercises swe ON swe.id = ss.workout_exercise_id
           JOIN strength_workouts sw ON sw.id = swe.workout_id
           WHERE sw.user_id=$1 AND swe.exercise_id=$2 AND ss.is_completed=TRUE AND ss.set_type <> 'W'`,
          [userId, exerciseId],
        );
        bestByExercise.set(exerciseId, {
          estimated1rm: Number(prior.rows[0].best_1rm),
          volume: Number(prior.rows[0].best_volume),
          weight: Number(prior.rows[0].best_weight),
        });
      }

      const workoutLog = await client.query(
        `INSERT INTO workout_logs(user_id, workout_id, workout_title, duration_seconds, calories_burned)
         VALUES($1, NULL, $2, $3, $4) RETURNING id, workout_title, duration_seconds, calories_burned, completed_at`,
        [userId, body.name.trim(), durationSeconds, caloriesBurned],
      );
      const strengthWorkout = await client.query(
        `INSERT INTO strength_workouts(user_id, workout_log_id, name, started_at, completed_at, duration_seconds, calories_burned)
         VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, workoutLog.rows[0].id, body.name.trim(), startedAt, completedAt, durationSeconds, caloriesBurned],
      );
      const workoutId = strengthWorkout.rows[0].id;

      for (const [orderIndex, exercise] of body.exercises.entries()) {
        const exerciseName = exercisesById.get(exercise.exerciseId)!;
        const workoutExercise = await client.query(
          `INSERT INTO strength_workout_exercises(workout_id, exercise_id, exercise_name, order_index)
           VALUES($1, $2, $3, $4) RETURNING id`,
          [workoutId, exercise.exerciseId, exerciseName, orderIndex],
        );
        let setIndex = 0;
        for (const set of exercise.sets) {
          setIndex += 1;
          const volume = set.isCompleted && set.setType !== 'W' ? set.weightKg * set.reps : 0;
          const estimated1rm = set.isCompleted && set.setType !== 'W' && set.reps > 0
            ? set.weightKg * (1 + set.reps / 30)
            : null;
          const best = bestByExercise.get(exercise.exerciseId)!;
          const records = set.isCompleted && set.setType !== 'W'
            ? [
                ...(estimated1rm !== null && estimated1rm > best.estimated1rm ? [{ metric: 'Estimated 1RM', value: estimated1rm }] : []),
                ...(volume > best.volume ? [{ metric: 'Set volume', value: volume }] : []),
                ...(set.weightKg > best.weight ? [{ metric: 'Weight', value: set.weightKg }] : []),
              ]
            : [];
          if (records.length) {
            personalRecords.push(...records.map((record) => ({ exercise: exerciseName, ...record })));
            best.estimated1rm = Math.max(best.estimated1rm, estimated1rm || 0);
            best.volume = Math.max(best.volume, volume);
            best.weight = Math.max(best.weight, set.weightKg);
          }
          if (set.isCompleted && set.setType !== 'W') totalVolumeKg += volume;

          await client.query(
            `INSERT INTO strength_sets(workout_exercise_id, set_index, set_type, weight_kg, reps, rpe,
                                       is_completed, volume_kg, estimated_1rm_kg, is_pr)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [workoutExercise.rows[0].id, setIndex, set.setType, set.weightKg, set.reps, set.rpe ?? null,
              set.isCompleted, volume, estimated1rm, records.length > 0],
          );
        }
      }

      await client.query('UPDATE strength_workouts SET total_volume_kg=$1 WHERE id=$2', [totalVolumeKg, workoutId]);
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

      return reply.status(201).send({
        success: true,
        workout: {
          id: workoutId,
          name: body.name.trim(),
          durationSeconds,
          totalVolumeKg: Number(totalVolumeKg.toFixed(2)),
          caloriesBurned,
          completedAt: workoutLog.rows[0].completed_at,
        },
        personalRecords,
        newlyUnlocked,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
