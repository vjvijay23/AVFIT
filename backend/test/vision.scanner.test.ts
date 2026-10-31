import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.PORT = '5998';
process.env.REDIS_URL = 'redis://127.0.0.1:6398';
process.env.DATABASE_URL = 'postgres://mock:mock@127.0.0.1:55431/mock_vision_test';
process.env.JWT_SECRET = 'mock-vision-test-secret-that-is-long-enough';

const [{ buildApp }, { pool, redis }, { VisionService }, { GoogleGenerativeAI }, { config }] = await Promise.all([
  import('../src/server.js'),
  import('../src/db/index.js'),
  import('../src/services/vision.service.js'),
  import('@google/generative-ai'),
  import('../src/config/index.js'),
]);
const [{ AchievementService }, { StreakService }, { adjustNutritionPortion }, { getFoodImageTransform }] = await Promise.all([
  import('../src/services/achievement.service.js'),
  import('../src/services/streak.service.js'),
  import('../../src/services/foodNutrition.ts'),
  import('../../src/services/foodImageGeometry.ts'),
]);

const nutrition = {
  dish_name: 'Vegetable soup', estimated_weight_g: 350, calories: 210,
  protein_g: 8, carbs_g: 32, fat_g: 6, fiber_g: 7, sugars_g: 5,
  saturated_fat_g: 1, sodium_mg: 540, cholesterol_mg: 0,
  confidence: 'medium', health_tips: 'Add a lean protein source if needed.',
  ingredients: [{ name: 'Carrot', weight_g: 80, calories: 33 }],
};
const originalRedis = { get: redis.get, set: redis.set, del: redis.del, eval: redis.eval, disconnect: redis.disconnect };
const originalPool = { query: pool.query, end: pool.end };
const originalAchievementUpdate = AchievementService.updateMetric;
const originalStreakRefresh = StreakService.refresh;
const originalGetGenerativeModel = GoogleGenerativeAI.prototype.getGenerativeModel;
const originalGemini = {
  key: config.geminiApiKey,
  model: config.geminiModel,
  fallback: config.geminiFallbackModel,
  primaryTimeout: config.geminiPrimaryTimeoutMs,
  fallbackTimeout: config.geminiFallbackTimeoutMs,
  totalTimeout: config.geminiTotalTimeoutMs,
};

const redisValues = new Map<string, string>();
const geminiCalls: Array<{ model: string; mimeType?: string; timeout?: number }> = [];
let cachedTtlSeconds: number | undefined;
let generateResponse: (model: string, parts: any[]) => Promise<string>;
let databaseQueries = 0;
let app: Awaited<ReturnType<typeof buildApp>>;
const userId = '11111111-1111-4111-8111-111111111111';
const phone = '+15555550123';
const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

function response(value: unknown) {
  return JSON.stringify(value);
}

function cacheKeyFor(image: string) {
  return `food_vision:v2:${createHash('sha256').update(image.replace(/\s/g, '')).digest('hex')}`;
}

function installRedisMock() {
  redisValues.clear();
  redis.get = (async (key: string) => redisValues.get(key) ?? null) as typeof redis.get;
  redis.set = (async (...args: any[]) => {
    const [key, value, mode, option, nx] = args;
    if (mode === 'PX' && nx === 'NX') {
      if (redisValues.has(key)) return null;
      redisValues.set(key, value);
      return 'OK';
    }
    if (mode === 'EX') {
      cachedTtlSeconds = Number(option);
      redisValues.set(key, value);
    }
    return 'OK';
  }) as typeof redis.set;
  redis.del = (async (...keys: string[]) => keys.reduce((count, key) => count + Number(redisValues.delete(key)), 0)) as typeof redis.del;
  redis.eval = (async (_script: string, _keyCount: number, key: string, token: string) => {
    if (redisValues.get(key) !== token) return 0;
    redisValues.delete(key);
    return 1;
  }) as typeof redis.eval;
}

function installGeminiMock() {
  geminiCalls.length = 0;
  GoogleGenerativeAI.prototype.getGenerativeModel = function (this: unknown, options: any) {
    const modelName = options.model as string;
    return {
      generateContent: async (parts: any[], requestOptions: { timeout?: number }) => {
        geminiCalls.push({ model: modelName, mimeType: parts[1]?.inlineData?.mimeType, timeout: requestOptions.timeout });
        const body = await generateResponse(modelName, parts);
        return { response: { text: () => body } };
      },
    } as any;
  } as any;
}

function bearer() {
  return app.jwt.sign({ id: userId, phone }, { expiresIn: '5m' });
}

before(async () => {
  config.geminiApiKey = 'test-key-not-a-real-secret';
  config.geminiModel = 'gemini-3.5-flash-lite';
  config.geminiFallbackModel = 'gemini-3.8-flash';
  config.geminiPrimaryTimeoutMs = 12000;
  config.geminiFallbackTimeoutMs = 9000;
  config.geminiTotalTimeoutMs = 22000;
  installRedisMock();
  installGeminiMock();
  pool.query = (async (..._args: any[]) => { databaseQueries += 1; return { rows: [], rowCount: 0 }; }) as typeof pool.query;
  app = await buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  redis.get = originalRedis.get;
  redis.set = originalRedis.set;
  redis.del = originalRedis.del;
  redis.eval = originalRedis.eval;
  pool.query = originalPool.query;
  config.geminiApiKey = originalGemini.key;
  config.geminiModel = originalGemini.model;
  config.geminiFallbackModel = originalGemini.fallback;
  config.geminiPrimaryTimeoutMs = originalGemini.primaryTimeout;
  config.geminiFallbackTimeoutMs = originalGemini.fallbackTimeout;
  config.geminiTotalTimeoutMs = originalGemini.totalTimeout;
  AchievementService.updateMetric = originalAchievementUpdate;
  StreakService.refresh = originalStreakRefresh;
  GoogleGenerativeAI.prototype.getGenerativeModel = originalGetGenerativeModel;
  redis.disconnect();
  await pool.end();
});

test('scan endpoint requires auth and rejects bad input before model calls', async () => {
  let calls = 0;
  generateResponse = async () => { calls += 1; return response(nutrition); };
  const unauthorized = await app.inject({ method: 'POST', url: '/api/v1/vision/scan-food', payload: { imageBase64 } });
  const invalid = await app.inject({
    method: 'POST', url: '/api/v1/vision/scan-food', headers: { authorization: `Bearer ${bearer()}` },
    payload: { imageBase64: 'not base64 !' },
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls, 0);
});

test('cache miss estimates via Flash-Lite, sends MIME type, adds metrics, and does not query PostgreSQL', async () => {
  installRedisMock();
  generateResponse = async () => response(nutrition);
  databaseQueries = 0;
  const result = await app.inject({
    method: 'POST', url: '/api/v1/vision/scan-food', headers: { authorization: `Bearer ${bearer()}` },
    payload: { imageBase64, mimeType: 'image/png' },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().data.dish_name, nutrition.dish_name);
  assert.equal(result.json().data.cached, false);
  assert.equal(geminiCalls.at(-1)?.model, 'gemini-3.5-flash-lite');
  assert.equal(geminiCalls.at(-1)?.mimeType, 'image/png');
  assert.equal(redisValues.get(cacheKeyFor(imageBase64)) !== undefined, true);
  assert.equal(cachedTtlSeconds, 604800);
  assert.match(result.headers['server-timing'] || '', /gemini;dur=/);
  assert.equal(databaseQueries, 0);
});

test('valid cached nutrition is returned without Gemini and without the Gemini key', async () => {
  installRedisMock();
  redisValues.set(cacheKeyFor(imageBase64), response(nutrition));
  const previousKey = config.geminiApiKey;
  config.geminiApiKey = '';
  const callsBefore = geminiCalls.length;
  try {
    const result = await VisionService.analyzeFoodImage(imageBase64, 'image/jpeg');
    assert.equal(result.cached, true);
    assert.equal(result.calories, nutrition.calories);
    assert.equal(geminiCalls.length, callsBefore);
  } finally {
    config.geminiApiKey = previousKey;
  }
});

test('invalid cached nutrition is discarded and recalculated', async () => {
  installRedisMock();
  redisValues.set(cacheKeyFor(imageBase64), response({ dish_name: 'incomplete' }));
  let calls = 0;
  generateResponse = async () => { calls += 1; return response(nutrition); };
  const result = await VisionService.analyzeFoodImage(imageBase64);
  assert.equal(result.dish_name, nutrition.dish_name);
  assert.equal(result.cached, false);
  assert.equal(calls, 1);
});

test('different image data gets independent cache-miss analyses', async () => {
  installRedisMock();
  let calls = 0;
  generateResponse = async () => { calls += 1; return response(nutrition); };
  await VisionService.analyzeFoodImage('Zmlyc3QtZGlmZmVyZW50LWltYWdl');
  await VisionService.analyzeFoodImage('c2Vjb25kLWRpZmZlcmVudC1pbWFnZQ==');
  assert.equal(calls, 2);
});

test('simultaneous identical cache misses invoke Gemini once and serve the joined request', async () => {
  installRedisMock();
  let calls = 0;
  generateResponse = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return response(nutrition);
  };
  const [first, second] = await Promise.all([
    VisionService.analyzeFoodImage('c2FtZS1pbWFnZQ=='),
    VisionService.analyzeFoodImage('c2FtZS1pbWFnZQ=='),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.dish_name, nutrition.dish_name);
  assert.equal(second.dish_name, nutrition.dish_name);
});

test('a Redis in-progress lock lets a separate worker result satisfy the waiting request', async () => {
  installRedisMock();
  const externalImage = 'c2Vjb25kLXByb2Nlc3MtaW1hZ2U=';
  const key = cacheKeyFor(externalImage);
  redisValues.set(`${key}:in_progress`, 'another-process');
  const callsBefore = geminiCalls.length;
  generateResponse = async () => response(nutrition);
  let metrics: any;
  setTimeout(() => redisValues.set(key, response(nutrition)), 30);
  const result = await VisionService.analyzeFoodImage(externalImage, 'image/jpeg', (value) => { metrics = value; });
  assert.equal(result.dish_name, nutrition.dish_name);
  assert.equal(result.cached, true);
  assert.equal(geminiCalls.length, callsBefore);
  assert.equal(metrics.source, 'redis_lock_deduplicated');
  assert.ok(metrics.deduplicationWaitMs >= 0);
});

test('transient primary model failure uses the configured fallback within its shorter timeout', async () => {
  installRedisMock();
  generateResponse = async (model) => {
    if (model === 'gemini-3.5-flash-lite') throw Object.assign(new Error('provider overloaded'), { status: 503 });
    return response(nutrition);
  };
  let metrics: any;
  const result = await VisionService.analyzeFoodImage('ZmFsbGJhY2staW1hZ2U=', 'image/png', (value) => { metrics = value; });
  assert.equal(result.dish_name, nutrition.dish_name);
  assert.deepEqual(geminiCalls.slice(-2).map((call) => call.model), ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.ok(geminiCalls.at(-2)?.timeout! <= 12000);
  assert.ok(geminiCalls.at(-1)?.timeout! <= 9000);
  assert.equal(metrics.source, 'fallback_success');
});

test('non-transient provider errors do not trigger a fallback', async () => {
  installRedisMock();
  generateResponse = async () => { throw Object.assign(new Error('bad model configuration'), { status: 400 }); };
  const callsBefore = geminiCalls.length;
  await assert.rejects(VisionService.analyzeFoodImage('bm9uLXRyYW5zaWVudA=='), (error: any) => error.statusCode === 503);
  assert.equal(geminiCalls.length - callsBefore, 1);
});

test('malformed model output is not cached', async () => {
  installRedisMock();
  generateResponse = async () => '{"dish_name":"Soup","calories":210}';
  await assert.rejects(VisionService.analyzeFoodImage('bWFsZm9ybWVkLW91dHB1dA=='), (error: any) => error.statusCode === 502);
  assert.equal(redisValues.has(cacheKeyFor('bWFsZm9ybWVkLW91dHB1dA==')), false);
});

test('Redis failure still returns a valid live estimate and reports a cache miss', async () => {
  redis.get = (async () => { throw new Error('mock Redis unavailable'); }) as typeof redis.get;
  redis.set = (async () => { throw new Error('mock Redis unavailable'); }) as typeof redis.set;
  generateResponse = async () => response(nutrition);
  let metrics: any;
  const result = await VisionService.analyzeFoodImage('cmVkaXMtZG93bg==', 'image/jpeg', (value) => { metrics = value; });
  assert.equal(result.dish_name, nutrition.dish_name);
  assert.equal(metrics.source, 'primary_success');
  installRedisMock();
});

test('Gemini timeout falls back; timing reports both attempts without exposing image or key', async () => {
  installRedisMock();
  generateResponse = async (model) => {
    if (model === 'gemini-3.5-flash-lite') throw Object.assign(new Error('request timed out'), { name: 'GoogleGenerativeAIAbortError' });
    return response(nutrition);
  };
  let metrics: any;
  const result = await VisionService.analyzeFoodImage('dGltZW91dC1pbWFnZQ==', 'image/webp', (value) => { metrics = value; });
  assert.equal(result.dish_name, nutrition.dish_name);
  assert.equal(metrics.source, 'fallback_success');
  assert.ok(metrics.primaryModelMs >= 0);
  assert.ok(metrics.fallbackModelMs >= 0);
  assert.equal(JSON.stringify(metrics).includes('test-key-not-a-real-secret'), false);
});

test('portion edits keep 50-gram steps and scale all nutrition values', () => {
  const start = { ...nutrition };
  const increased = adjustNutritionPortion(start, 400);
  assert.equal(increased.estimated_weight_g, 400);
  assert.equal(increased.calories, 240);
  assert.equal(increased.protein_g, 9.1);
  const returned = adjustNutritionPortion(increased, 350);
  assert.equal(returned.calories, nutrition.calories);
  assert.equal(adjustNutritionPortion(start, 0).estimated_weight_g, 50);
});

test('image crop geometry keeps 4:3 and caps large output at 1024 pixels wide', () => {
  const landscape = getFoodImageTransform(2000, 1000);
  assert.equal(landscape.crop.width / landscape.crop.height, 4 / 3);
  assert.equal(landscape.crop.originX, 334);
  assert.equal(landscape.resizeWidth, 1024);

  const portrait = getFoodImageTransform(900, 1600);
  assert.equal(portrait.crop.width / portrait.crop.height, 4 / 3);
  assert.equal(portrait.resizeWidth, 900);
});

test('saving a scanned meal persists the full nutrition estimate only on the diary endpoint', async () => {
  let insertValues: any[] | undefined;
  pool.query = (async (query: any, values?: any[]) => {
    const sql = String(query);
    if (sql.startsWith('INSERT INTO meals')) {
      insertValues = values;
      return { rows: [{ id: 'mock-meal-1', dish_name: values?.[1] }], rowCount: 1 };
    }
    if (sql.includes('COUNT(DISTINCT logged_at')) return { rows: [{ count: 1 }], rowCount: 1 };
    if (sql.includes('COUNT(*)::int count FROM meals')) return { rows: [{ count: 1 }], rowCount: 1 };
    throw new Error(`Unexpected mock query: ${sql}`);
  }) as typeof pool.query;
  AchievementService.updateMetric = async () => [] as any;
  StreakService.refresh = async () => 1 as any;

  const result = await app.inject({
    method: 'POST', url: '/api/v1/meals', headers: { authorization: `Bearer ${bearer()}` },
    payload: {
      dishName: nutrition.dish_name, portionGrams: 350, calories: nutrition.calories,
      proteinG: nutrition.protein_g, carbsG: nutrition.carbs_g, fatG: nutrition.fat_g,
      fiberG: nutrition.fiber_g, sugarsG: nutrition.sugars_g, saturatedFatG: nutrition.saturated_fat_g,
      sodiumMg: nutrition.sodium_mg, cholesterolMg: nutrition.cholesterol_mg,
      confidence: nutrition.confidence, healthTips: nutrition.health_tips,
      ingredients: nutrition.ingredients, mealType: 'lunch',
    },
  });
  assert.equal(result.statusCode, 201);
  assert.equal(result.json().meal.id, 'mock-meal-1');
  assert.equal(insertValues?.[12], nutrition.confidence);
  assert.equal(insertValues?.[13], nutrition.health_tips);
  assert.deepEqual(JSON.parse(insertValues?.[14]), nutrition.ingredients);
  assert.equal(insertValues?.[15], 'lunch');
});
