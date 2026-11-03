import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { pool, redis } from '../db/index.js';

type StravaToken = { access_token: string; refresh_token: string; expires_at: number; athlete?: { id?: number } };
const configured = () => Boolean(config.stravaClientId && config.stravaClientSecret && config.stravaRedirectUri && config.stravaTokenEncryptionKey.length >= 32);
const encryptionKey = () => createHash('sha256').update(config.stravaTokenEncryptionKey).digest();
function encrypt(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}
function decrypt(value: string) {
  const [iv, tag, ciphertext] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
function requireConfigured() {
  if (!configured()) {
    const error = new Error('Strava is not configured on this backend. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI, and STRAVA_TOKEN_ENCRYPTION_KEY.');
    (error as Error & { statusCode?: number }).statusCode = 503;
    throw error;
  }
}

export class StravaService {
  static isConfigured() { return configured(); }

  static async status(userId: string) {
    const result = await pool.query('SELECT athlete_id, athlete_name, scopes, connected_at FROM strava_connections WHERE user_id=$1', [userId]);
    return { configured: configured(), connected: Boolean(result.rows[0]), connection: result.rows[0] || null };
  }

  static async authorizationUrl(userId: string) {
    requireConfigured();
    const state = randomBytes(32).toString('hex');
    await redis.set(`strava:oauth:${state}`, userId, 'EX', 600, 'NX');
    const url = new URL('https://www.strava.com/oauth/authorize');
    url.search = new URLSearchParams({ client_id: config.stravaClientId, response_type: 'code', redirect_uri: config.stravaRedirectUri, approval_prompt: 'auto', scope: 'read,activity:read_all', state }).toString();
    return url.toString();
  }

  static async completeAuthorization(code: string, state: string, scopes: string) {
    requireConfigured();
    const stateKey = `strava:oauth:${state}`;
    const userId = await redis.get(stateKey);
    if (!userId) throw new Error('Strava authorization expired. Start the connection again.');
    await redis.del(stateKey);
    if (!scopes.split(/[ ,]+/).includes('activity:read') && !scopes.split(/[ ,]+/).includes('activity:read_all')) throw new Error('Strava activity read access was not granted. Please connect again and allow activity access.');
    const response = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.stravaClientId, client_secret: config.stravaClientSecret, code, grant_type: 'authorization_code' }) });
    if (!response.ok) throw new Error(`Strava token exchange failed (${response.status}). Check the registered callback URL and app credentials.`);
    const tokens = await response.json() as StravaToken;
    const athlete = tokens.athlete || {};
    const athleteName = [String((athlete as any).firstname || ''), String((athlete as any).lastname || '')].filter(Boolean).join(' ') || null;
    await pool.query(`INSERT INTO strava_connections(user_id,athlete_id,athlete_name,scopes,access_token_encrypted,refresh_token_encrypted,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET athlete_id=EXCLUDED.athlete_id,athlete_name=EXCLUDED.athlete_name,scopes=EXCLUDED.scopes,access_token_encrypted=EXCLUDED.access_token_encrypted,refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,expires_at=EXCLUDED.expires_at,connected_at=NOW()`,
    [userId, String(athlete.id || ''), athleteName, scopes, encrypt(tokens.access_token), encrypt(tokens.refresh_token), tokens.expires_at]);
    return userId;
  }

  private static async accessToken(userId: string) {
    requireConfigured();
    const result = await pool.query('SELECT * FROM strava_connections WHERE user_id=$1', [userId]);
    if (!result.rows[0]) throw new Error('Connect your Strava account before syncing activities.');
    const connection = result.rows[0];
    if (Number(connection.expires_at) > Math.floor(Date.now() / 1000) + 3600) return decrypt(connection.access_token_encrypted);
    const refreshToken = decrypt(connection.refresh_token_encrypted);
    const response = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.stravaClientId, client_secret: config.stravaClientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }) });
    if (!response.ok) throw new Error('Strava access expired and could not be refreshed. Disconnect and connect Strava again.');
    const refreshed = await response.json() as StravaToken;
    await pool.query('UPDATE strava_connections SET access_token_encrypted=$1,refresh_token_encrypted=$2,expires_at=$3 WHERE user_id=$4', [encrypt(refreshed.access_token), encrypt(refreshed.refresh_token), refreshed.expires_at, userId]);
    return refreshed.access_token;
  }

  static async sync(userId: string) {
    const token = await this.accessToken(userId);
    const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30&page=1', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Strava rejected its access token. Reconnect Strava and try again.');
      if (response.status === 429) throw new Error('Strava rate limit reached. Please try syncing later.');
      throw new Error(`Strava activity sync failed (${response.status}).`);
    }
    const activities = await response.json() as Array<Record<string, any>>;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const a of activities) {
        await client.query(`INSERT INTO strava_activities(user_id,strava_activity_id,name,sport_type,start_date,distance_m,moving_time_sec,elapsed_time_sec,total_elevation_gain_m,average_speed_mps,max_speed_mps,average_heartrate,calories,polyline,raw_data)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
          ON CONFLICT(user_id,strava_activity_id) DO UPDATE SET name=EXCLUDED.name,sport_type=EXCLUDED.sport_type,start_date=EXCLUDED.start_date,distance_m=EXCLUDED.distance_m,moving_time_sec=EXCLUDED.moving_time_sec,elapsed_time_sec=EXCLUDED.elapsed_time_sec,total_elevation_gain_m=EXCLUDED.total_elevation_gain_m,average_speed_mps=EXCLUDED.average_speed_mps,max_speed_mps=EXCLUDED.max_speed_mps,average_heartrate=EXCLUDED.average_heartrate,calories=EXCLUDED.calories,polyline=EXCLUDED.polyline,raw_data=EXCLUDED.raw_data`,
        [userId, String(a.id), a.name || 'Strava activity', a.sport_type || a.type || 'Workout', a.start_date, a.distance || 0, a.moving_time || 0, a.elapsed_time || 0, a.total_elevation_gain || 0, a.average_speed || 0, a.max_speed || 0, a.average_heartrate || null, a.calories || 0, a.map?.summary_polyline || null, JSON.stringify(a)]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return { synced: activities.length, activities: await this.activities(userId) };
  }

  static async activities(userId: string) {
    const result = await pool.query('SELECT strava_activity_id,name,sport_type,start_date,distance_m,moving_time_sec,elapsed_time_sec,total_elevation_gain_m,average_speed_mps,max_speed_mps,average_heartrate,calories,polyline FROM strava_activities WHERE user_id=$1 ORDER BY start_date DESC LIMIT 30', [userId]);
    return result.rows;
  }

  static async disconnect(userId: string) {
    requireConfigured();
    const row = await pool.query('SELECT access_token_encrypted,refresh_token_encrypted FROM strava_connections WHERE user_id=$1', [userId]);
    if (row.rows[0]) {
      const token = decrypt(row.rows[0].refresh_token_encrypted);
      const basic = Buffer.from(`${config.stravaClientId}:${config.stravaClientSecret}`).toString('base64');
      await fetch('https://www.strava.com/oauth/revoke', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: 'refresh_token' }) });
    }
    await pool.query('DELETE FROM strava_connections WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM strava_activities WHERE user_id=$1', [userId]);
  }
}
