import { pool } from '../db/index.js';
import { AchievementService } from './achievement.service.js';

export class StreakService {
  static async refresh(userId: string) {
    const result = await pool.query(`SELECT DISTINCT active_date FROM (
      SELECT log_date AS active_date FROM daily_activity_logs WHERE user_id=$1 AND steps>0
      UNION SELECT logged_at::date FROM meals WHERE user_id=$1
      UNION SELECT completed_at::date FROM workout_logs WHERE user_id=$1
    ) dates ORDER BY active_date DESC`, [userId]);
    const dates: string[] = result.rows.map((row) => new Date(row.active_date).toISOString().slice(0,10));
    const today = new Date().toISOString().slice(0,10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    let count = dates[0] === today || dates[0] === yesterday ? 1 : 0;
    for (let i = 1; i < dates.length && count > 0; i++) {
      const prior = new Date(`${dates[i-1]}T00:00:00.000Z`);
      prior.setUTCDate(prior.getUTCDate()-1);
      if (dates[i] !== prior.toISOString().slice(0,10)) break;
      count++;
    }
    await pool.query('UPDATE profiles SET streak_count=$2,updated_at=NOW() WHERE id=$1', [userId,count]);
    await AchievementService.updateMetric(userId, 'streak_days', count);
    return count;
  }
}
