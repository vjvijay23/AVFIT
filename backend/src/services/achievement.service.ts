import { pool } from '../db/index.js';

export class AchievementService {
  static async updateMetric(userId: string, metricType: string, value: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const defs = await client.query('SELECT * FROM achievement_definitions WHERE metric_type = $1', [metricType]);
      const unlocked = [];
      for (const def of defs.rows) {
        await client.query(`INSERT INTO user_achievements (user_id, achievement_id, current_value, target_value)
          VALUES ($1,$2,0,$3) ON CONFLICT (user_id,achievement_id) DO NOTHING`, [userId, def.id, def.target_value]);
        const current = await client.query(`SELECT is_unlocked FROM user_achievements
          WHERE user_id=$1 AND achievement_id=$2 FOR UPDATE`, [userId, def.id]);
        const wasUnlocked = Boolean(current.rows[0]?.is_unlocked);
        const result = await client.query(`UPDATE user_achievements
          SET current_value=GREATEST(current_value,$3),
              is_unlocked=(GREATEST(current_value,$3) >= target_value),
              unlocked_at=CASE WHEN NOT is_unlocked AND GREATEST(current_value,$3) >= target_value THEN NOW() ELSE unlocked_at END,
              updated_at=NOW()
          WHERE user_id=$1 AND achievement_id=$2
          RETURNING is_unlocked`, [userId, def.id, Math.max(0, Math.floor(value))]);
        if (!wasUnlocked && result.rows[0]?.is_unlocked) {
          await client.query('UPDATE profiles SET total_trophy_points=total_trophy_points+$2 WHERE id=$1', [userId, def.points]);
          unlocked.push({ code: def.code, title: def.title, tier: def.tier, points: def.points });
        }
      }
      await client.query('COMMIT');
      return unlocked;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getForUser(userId: string) {
    const result = await pool.query(`SELECT d.*, ua.current_value, ua.is_unlocked, ua.unlocked_at, ua.is_shared
      FROM achievement_definitions d LEFT JOIN user_achievements ua
        ON ua.achievement_id=d.id AND ua.user_id=$1
      ORDER BY d.category, d.target_value`, [userId]);
    const rows = result.rows;
    const unlocked = rows.filter((row) => row.is_unlocked);
    return {
      achievements: rows.map((row) => ({ ...row, current_value: row.current_value || 0, progress_percent: Math.min(100, Math.round(((row.current_value || 0) / row.target_value) * 100)) })),
      summary: {
        totalTrophies: rows.length,
        unlockedCount: unlocked.length,
        totalPoints: unlocked.reduce((total, item) => total + item.points, 0),
        byTier: Object.fromEntries(['bronze','silver','gold','platinum','diamond'].map((tier) => [tier, unlocked.filter((item) => item.tier === tier).length])),
        recentUnlocks: unlocked.sort((a, b) => new Date(b.unlocked_at).getTime() - new Date(a.unlocked_at).getTime()).slice(0, 5),
      },
    };
  }
}
