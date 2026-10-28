import { redis, pool } from '../db/index.js';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  score: number;
  displayValue: string;
}

export class LeaderboardService {
  /**
   * Get top distance walkers (all-time or this week)
   */
  static async getWalkingLeaderboard(timeframe: 'alltime' | 'week' = 'alltime', limit = 25): Promise<LeaderboardEntry[]> {
    const key =
      timeframe === 'week'
        ? `leaderboard:distance:week:${isoWeekKey(new Date())}`
        : 'leaderboard:distance:alltime';

    // Fetch top users with scores (scores are stored in meters)
    let raw: string[] = [];
    try { raw = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES'); }
    catch (error) { console.warn('[Redis] Leaderboard read failed; using PostgreSQL:', error); }

    if (!raw || raw.length === 0) {
      // Fallback: Query from PostgreSQL directly if Redis is cold
      const fallbackQuery = `
        SELECT 
          p.id AS user_id, 
          p.full_name, 
          p.avatar_url, 
          COALESCE(SUM(a.distance_km), 0) AS total_km
        FROM profiles p
        LEFT JOIN recorded_activities a ON p.id = a.user_id
          AND ($2::text = 'alltime' OR date_trunc('week', a.start_time AT TIME ZONE 'UTC') = date_trunc('week', NOW() AT TIME ZONE 'UTC'))
        GROUP BY p.id, p.full_name, p.avatar_url
        ORDER BY total_km DESC
        LIMIT $1;
      `;
      const fbResult = await pool.query(fallbackQuery, [limit, timeframe]);
      return fbResult.rows.map((row, index) => ({
        rank: index + 1,
        userId: row.user_id,
        fullName: row.full_name || 'Walker',
        avatarUrl: row.avatar_url,
        score: Math.round(parseFloat(row.total_km) * 1000),
        displayValue: `${parseFloat(row.total_km).toFixed(2)} km`,
      }));
    }

    const entries: Array<{ userId: string; meters: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({
        userId: raw[i],
        meters: parseInt(raw[i + 1], 10),
      });
    }

    const userIds = entries.map((e) => e.userId);
    const profileMap = new Map<string, { fullName: string; avatarUrl: string | null }>();

    if (userIds.length > 0) {
      const pRes = await pool.query(
        `SELECT id, full_name, avatar_url FROM profiles WHERE id = ANY($1::uuid[])`,
        [userIds]
      );
      for (const row of pRes.rows) {
        profileMap.set(row.id, {
          fullName: row.full_name || 'Runner',
          avatarUrl: row.avatar_url,
        });
      }
    }

    return entries.map((entry, index) => {
      const prof = profileMap.get(entry.userId);
      const km = (entry.meters / 1000).toFixed(2);
      return {
        rank: index + 1,
        userId: entry.userId,
        fullName: prof?.fullName || `User ${entry.userId.slice(0, 6)}`,
        avatarUrl: prof?.avatarUrl || null,
        score: entry.meters,
        displayValue: `${km} km`,
      };
    });
  }

  /**
   * Sync a user's daily step count to the steps leaderboard
   */
  static async recordSteps(userId: string, steps: number) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `leaderboard:steps:${today}`;
    const result = await pool.query(`
      INSERT INTO daily_activity_logs (user_id, log_date, steps)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, log_date)
      DO UPDATE SET steps = GREATEST(daily_activity_logs.steps, EXCLUDED.steps), synced_at = NOW()
      RETURNING steps;
    `, [userId, today, steps]);
    try { await redis.zadd(key, result.rows[0].steps, userId); }
    catch (error) { console.warn('[Redis] Step leaderboard cache update failed; PostgreSQL remains authoritative:', error); }
  }

  static async getStepsLeaderboard(limit = 25): Promise<LeaderboardEntry[]> {
    const today = new Date().toISOString().slice(0, 10);
    const ranked = await pool.query(`
      SELECT d.user_id, p.full_name, p.avatar_url, d.steps
      FROM daily_activity_logs d JOIN profiles p ON p.id = d.user_id
      WHERE d.log_date = $1
      ORDER BY d.steps DESC, d.user_id
      LIMIT $2;
    `, [today, limit]);
    return ranked.rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      fullName: row.full_name || 'Walker',
      avatarUrl: row.avatar_url,
      score: Number(row.steps),
      displayValue: `${Number(row.steps).toLocaleString()} steps`,
    }));
  }
}

function isoWeekKey(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
