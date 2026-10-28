import { pool, redis } from '../db/index.js';
import { AchievementService } from './achievement.service.js';
import { ChallengeService } from './challenge.service.js';
import { StreakService } from './streak.service.js';

export interface GPSCoordinate {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  speed?: number | null;
  timestamp?: number;
  accuracy?: number | null;
}

export interface ActivityRecordPayload {
  id?: string;
  userId: string;
  sportType?: string;
  title?: string;
  durationSec: number;
  distanceKm: number;
  calories: number;
  avgPace: string;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  elevationGainM?: number;
  routeCoordinates: GPSCoordinate[];
  startTime?: string;
  endTime?: string;
}

export class ActivityService {
  /**
   * Save a completed walking/running workout with PostGIS spatial geometry
   */
  static async recordActivity(data: ActivityRecordPayload) {
    const activityId = data.id || `act_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const sportType = data.sportType || 'walking';
    const coords = data.routeCoordinates || [];

    // Construct PostGIS LineString GeoJSON if >= 2 points
    let geoJson = null;
    if (coords.length >= 2) {
      geoJson = {
        type: 'LineString',
        coordinates: coords.map((c) => [c.longitude, c.latitude]),
      };
    }

    const query = `
      INSERT INTO recorded_activities (
        id, user_id, sport_type, title, duration_sec, distance_km, calories,
        avg_pace, avg_speed_kmh, max_speed_kmh, elevation_gain_m,
        route_geom, route_coordinates, start_time, end_time
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        CASE WHEN $12::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($12), 4326) ELSE NULL END,
        $13, $14, $15
      )
      RETURNING id, user_id, sport_type, title, duration_sec, distance_km, calories, avg_pace, created_at;
    `;

    const values = [
      activityId,
      data.userId,
      sportType,
      data.title || 'Outdoor Walk',
      data.durationSec,
      data.distanceKm,
      data.calories,
      data.avgPace,
      data.avgSpeedKmh || (data.durationSec > 0 ? (data.distanceKm / (data.durationSec / 3600)) : 0),
      data.maxSpeedKmh || 0,
      data.elevationGainM || 0,
      geoJson ? JSON.stringify(geoJson) : null,
      JSON.stringify(coords),
      data.startTime || new Date().toISOString(),
      data.endTime || new Date().toISOString(),
    ];

    const client = await pool.connect();
    let recorded;
    try {
      await client.query('BEGIN');
      const result = await client.query(query, values);
      recorded = result.rows[0];

      const activityDate = (data.startTime || new Date().toISOString()).slice(0, 10);
      const estimatedSteps = Math.round(data.distanceKm * 1350);
      await client.query(`
        INSERT INTO daily_activity_logs (user_id, log_date, steps, distance_km, calories_burned, active_minutes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, log_date)
        DO UPDATE SET
          distance_km = daily_activity_logs.distance_km + EXCLUDED.distance_km,
          calories_burned = daily_activity_logs.calories_burned + EXCLUDED.calories_burned,
          active_minutes = daily_activity_logs.active_minutes + EXCLUDED.active_minutes,
          synced_at = NOW();
      `, [data.userId, activityDate, estimatedSteps, data.distanceKm, data.calories, Math.round(data.durationSec / 60)]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Update Redis Leaderboards for real-time Strava-style rankings
    try {
      const distanceMeters = Math.round(data.distanceKm * 1000);
      const weekKey = `leaderboard:distance:week:${isoWeekKey(new Date(data.startTime || Date.now()))}`;
      await redis.zincrby('leaderboard:distance:alltime', distanceMeters, data.userId);
      await redis.zincrby(weekKey, distanceMeters, data.userId);
    } catch (err) {
      console.warn('[Redis] Failed to update leaderboard score:', err);
    }

    const [distance, daily] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(distance_km),0)::float total FROM recorded_activities WHERE user_id=$1', [data.userId]),
      pool.query('SELECT steps FROM daily_activity_logs WHERE user_id=$1 AND log_date=$2', [data.userId,(data.startTime || new Date().toISOString()).slice(0,10)]),
    ]);
    await Promise.all([
      AchievementService.updateMetric(data.userId,'distance_km',Math.floor(distance.rows[0].total)),
      AchievementService.updateMetric(data.userId,'steps',daily.rows[0]?.steps || 0),
      ChallengeService.refreshUser(data.userId),
      StreakService.refresh(data.userId),
    ]);

    return recorded;
  }

  /**
   * Fetch user activity history with optional GeoJSON route geometry
   */
  static async getUserActivities(userId: string, limit = 20) {
    const query = `
      SELECT 
        id, user_id, sport_type, title, duration_sec, distance_km, calories,
        avg_pace, avg_speed_kmh, max_speed_kmh, elevation_gain_m,
        start_time, end_time, created_at,
        ST_AsGeoJSON(route_geom)::json AS route_geojson
      FROM recorded_activities
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Get specific activity with full high-resolution GPS coordinate stream
   */
  static async getActivityById(id: string) {
    const query = `
      SELECT 
        id, user_id, sport_type, title, duration_sec, distance_km, calories,
        avg_pace, avg_speed_kmh, max_speed_kmh, elevation_gain_m,
        route_coordinates, start_time, end_time, created_at,
        ST_AsGeoJSON(route_geom)::json AS route_geojson,
        ST_Length(route_geom::geography) AS calculated_meters
      FROM recorded_activities
      WHERE id = $1;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
}

function isoWeekKey(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
