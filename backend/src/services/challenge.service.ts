import { pool } from '../db/index.js';
import { AchievementService } from './achievement.service.js';

export class ChallengeService {
  static async refreshUser(userId: string) {
    const client = await pool.connect();
    try {
      await client.query(`UPDATE challenge_participants cp SET current_value = CASE c.target_metric
        WHEN 'steps' THEN COALESCE((SELECT SUM(d.steps)::int FROM daily_activity_logs d WHERE d.user_id=cp.user_id AND d.log_date BETWEEN c.start_date AND c.end_date),0)
        WHEN 'distance_km' THEN COALESCE((SELECT ROUND(SUM(a.distance_km))::int FROM recorded_activities a WHERE a.user_id=cp.user_id AND a.start_time::date BETWEEN c.start_date AND c.end_date),0)
        WHEN 'workout_count' THEN COALESCE((SELECT COUNT(*)::int FROM workout_logs w WHERE w.user_id=cp.user_id AND w.completed_at::date BETWEEN c.start_date AND c.end_date),0)
        ELSE 0 END,
        is_completed = CASE c.target_metric
        WHEN 'steps' THEN COALESCE((SELECT SUM(d.steps)::int FROM daily_activity_logs d WHERE d.user_id=cp.user_id AND d.log_date BETWEEN c.start_date AND c.end_date),0) >= c.target_value
        WHEN 'distance_km' THEN COALESCE((SELECT SUM(a.distance_km) FROM recorded_activities a WHERE a.user_id=cp.user_id AND a.start_time::date BETWEEN c.start_date AND c.end_date),0) >= c.target_value
        WHEN 'workout_count' THEN COALESCE((SELECT COUNT(*)::int FROM workout_logs w WHERE w.user_id=cp.user_id AND w.completed_at::date BETWEEN c.start_date AND c.end_date),0) >= c.target_value
        ELSE FALSE END
        FROM challenges c WHERE cp.challenge_id=c.id AND cp.user_id=$1`, [userId]);
      const completed = await client.query('SELECT COUNT(*)::int count FROM challenge_participants WHERE user_id=$1 AND is_completed=TRUE', [userId]);
      await AchievementService.updateMetric(userId,'challenge_complete_count',completed.rows[0].count);
    } finally { client.release(); }
  }
}
