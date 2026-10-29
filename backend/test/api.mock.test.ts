import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// Configure test mode before dynamically loading modules that create clients.
process.env.NODE_ENV = 'test';
process.env.PORT = '5999';
process.env.REDIS_URL = 'redis://127.0.0.1:6399';
process.env.DATABASE_URL = 'postgres://mock:mock@127.0.0.1:55432/mock_api_test';
process.env.JWT_SECRET = 'mock-api-test-secret-that-is-long-enough';

const [{ buildApp }, { pool, redis }, { ActivityService }, { LeaderboardService }, { config }] = await Promise.all([
  import('../src/server.js'),
  import('../src/db/index.js'),
  import('../src/services/activity.service.js'),
  import('../src/services/leaderboard.service.js'),
  import('../src/config/index.js'),
]);

const mockUserId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const mockPhone = '+15555550123';

let app: Awaited<ReturnType<typeof buildApp>>;
let queryHandler: (...args: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
let pingHandler: () => Promise<string>;
const originalQuery = pool.query;
const originalPing = redis.ping;
const originalFetch = globalThis.fetch;

pool.query = ((...args: any[]) => queryHandler(...args)) as typeof pool.query;
redis.ping = (() => pingHandler()) as typeof redis.ping;

before(async () => {
  app = await buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  pool.query = originalQuery;
  redis.ping = originalPing;
  redis.disconnect();
  await pool.end();
  globalThis.fetch = originalFetch;
});

function bearerToken(id = mockUserId) {
  return app.jwt.sign({ id, phone: mockPhone }, { expiresIn: '5m' });
}

test('health reports mocked PostgreSQL and Redis as healthy', async () => {
  queryHandler = async () => ({ rows: [{ ok: 1 }], rowCount: 1 });
  pingHandler = async () => 'PONG';

  const response = await app.inject({ method: 'GET', url: '/health' });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'healthy');
  assert.equal(body.postgres, true);
  assert.equal(body.redis, true);
  assert.equal(body.version, process.env.RENDER_GIT_COMMIT || 'local');
});

test('health reports degraded when mocked Redis is unavailable', async () => {
  queryHandler = async () => ({ rows: [{ ok: 1 }], rowCount: 1 });
  pingHandler = async () => { throw new Error('mock Redis unavailable'); };

  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().status, 'degraded');
  assert.equal(response.json().postgres, true);
  assert.equal(response.json().redis, false);
});

test('MSG91 access-token verification resolves the existing user in PostgreSQL', async () => {
  const previousAuthKey = config.msg91AuthKey;
  config.msg91AuthKey = 'mock-msg91-authkey';
  const accessToken = 'mock-msg91-access-token-0001';
  let requestedUrl = '';
  let requestedBody: Record<string, string> = {};
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ type: 'success', message: mockPhone }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  queryHandler = async () => ({ rows: [{
    id: mockUserId,
    phone: mockPhone,
    full_name: 'Mock Athlete',
    avatar_url: null,
    streak_count: 3,
    is_onboarded: true,
  }], rowCount: 1 });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: mockPhone, accessToken, authMode: 'login' },
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(requestedUrl, 'https://control.msg91.com/api/v5/widget/verifyAccessToken');
    assert.equal(requestedBody.authkey, 'mock-msg91-authkey');
    assert.equal(requestedBody['access-token'], accessToken);
    assert.equal(body.success, true);
    assert.equal(body.user.id, mockUserId);
    assert.equal((await app.jwt.verify<{ id: string }>(body.token)).id, mockUserId);
  } finally {
    config.msg91AuthKey = previousAuthKey;
  }
});

test('MSG91 verification rejects a verified token for a different phone before reading user data', async () => {
  const previousAuthKey = config.msg91AuthKey;
  config.msg91AuthKey = 'mock-msg91-authkey';
  let queryCount = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify({ type: 'success', message: '+15555550124' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  queryHandler = async () => { queryCount += 1; return { rows: [], rowCount: 0 }; };

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: mockPhone, accessToken: 'mock-msg91-access-token-0001', authMode: 'login' },
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /phone number verified by MSG91 does not match/);
    assert.equal(queryCount, 0);
  } finally {
    config.msg91AuthKey = previousAuthKey;
  }
});

test('MSG91 invalid access-token responses are reported as invalid OTP instead of service outages', async () => {
  const previousAuthKey = config.msg91AuthKey;
  config.msg91AuthKey = 'mock-msg91-authkey';
  let queryCount = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify({ type: 'error', message: 'Invalid access token' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
  queryHandler = async () => { queryCount += 1; return { rows: [], rowCount: 0 }; };

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: mockPhone, accessToken: 'expired-msg91-access-token', authMode: 'signup' },
    });
    assert.equal(response.statusCode, 401);
    assert.match(response.json().error, /MSG91 rejected the verification token/);
    assert.equal(queryCount, 0);
  } finally {
    config.msg91AuthKey = previousAuthKey;
  }
});

test('MSG91 transport failures include a sanitized diagnostic code', async () => {
  const previousAuthKey = config.msg91AuthKey;
  config.msg91AuthKey = 'mock-msg91-authkey';
  const cause = Object.assign(new Error('network unreachable'), { code: 'ENETUNREACH' });
  globalThis.fetch = (async () => { throw Object.assign(new TypeError('fetch failed'), { cause }); }) as typeof fetch;
  queryHandler = async () => { throw new Error('User query should not run after failed token verification.'); };

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: mockPhone, accessToken: 'mock-msg91-access-token-0001', authMode: 'signup' },
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: 'Could not reach MSG91 verification. Please try again shortly.',
      providerDiagnosticCode: 'ENETUNREACH',
    });
  } finally {
    config.msg91AuthKey = previousAuthKey;
  }
});

test('MSG91 widget user-exists validation accepts valid phone identifiers without exposing accounts', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/auth/otp/user-exists?identifier=919876543210' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { user_found: true, identifier: '919876543210' });
});

test('OTP verification cannot create a user without an MSG91 access token', async () => {
  let queryCount = 0;
  queryHandler = async () => { queryCount += 1; return { rows: [], rowCount: 0 }; };
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { phone: mockPhone } });
  assert.equal(response.statusCode, 401);
  assert.equal(queryCount, 0);
});

test('workout catalogue returns a mocked database row', async () => {
  const workouts = [{ id: 'mock-workout-1', title: 'Mock Mobility', category: 'Mobility' }];
  queryHandler = async () => ({ rows: workouts, rowCount: workouts.length });

  const response = await app.inject({ method: 'GET', url: '/api/v1/workouts' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { success: true, count: 1, workouts });
});

test('walking leaderboard returns mocked service results', async () => {
  const original = LeaderboardService.getWalkingLeaderboard;
  LeaderboardService.getWalkingLeaderboard = async () => ([
    { userId: mockUserId, name: 'Mock Athlete', distanceKm: 12.5 },
  ]) as any;
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/leaderboard/walking?timeframe=week' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().timeframe, 'week');
    assert.equal(response.json().count, 1);
    assert.equal(response.json().leaderboard[0].distanceKm, 12.5);
  } finally {
    LeaderboardService.getWalkingLeaderboard = original;
  }
});

test('protected fitness profile rejects requests without a bearer token', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/fitness/profile' });
  assert.equal(response.statusCode, 401);
  assert.match(response.json().error, /valid bearer token/i);
});

test('activity recording rejects a body owned by another user', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/activities/record',
    headers: { authorization: `Bearer ${bearerToken()}` },
    payload: { userId: otherUserId, durationSec: 120, distanceKm: 1, calories: 50, routeCoordinates: [] },
  });
  assert.equal(response.statusCode, 403);
  assert.match(response.json().error, /authenticated account/i);
});

test('activity recording returns a mocked service result for its owner', async () => {
  const original = ActivityService.recordActivity;
  ActivityService.recordActivity = async (payload) => ({ id: 'mock-activity-1', user_id: payload.userId }) as any;
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/activities/record',
      headers: { authorization: `Bearer ${bearerToken()}` },
      payload: {
        userId: mockUserId,
        durationSec: 120,
        distanceKm: 1.25,
        calories: 50,
        avgPace: '1:36',
        routeCoordinates: [{ latitude: 37.77, longitude: -122.42, timestamp: 1 }],
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().activity.id, 'mock-activity-1');
  } finally {
    ActivityService.recordActivity = original;
  }
});

test('meal creation validates malformed input without querying PostgreSQL', async () => {
  let queryCount = 0;
  queryHandler = async () => { queryCount += 1; return { rows: [], rowCount: 0 }; };

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/meals',
    headers: { authorization: `Bearer ${bearerToken()}` },
    payload: { dishName: '', calories: -1, mealType: 'brunch' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(queryCount, 0);
});
