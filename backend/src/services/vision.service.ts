import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';
import { config } from '../config/index.js';
import { redis } from '../db/index.js';

export interface NutritionEstimate {
  dish_name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugars_g: number;
  saturated_fat_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
  confidence: 'high' | 'medium' | 'low';
  health_tips: string;
  ingredients: Array<{ name: string; weight_g: number; calories: number }>;
}

export interface VisionScanMetrics {
  source: 'cache_hit' | 'inflight_deduplicated' | 'redis_lock_deduplicated' | 'primary_success' | 'fallback_success';
  redisLookupMs: number;
  deduplicationWaitMs: number;
  geminiMs: number;
  responseValidationMs: number;
  totalMs: number;
  primaryModelMs?: number;
  fallbackModelMs?: number;
}

export class VisionServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly providerDiagnostic?: { status?: number; code?: string; message?: string; model?: string },
  ) {
    super(message);
    this.name = 'VisionServiceError';
  }
}

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const REDIS_COMMAND_TIMEOUT_MS = 450;
const REDIS_LOCK_TTL_MS = 30_000;
const LOCK_POLL_MS = 120;
const LOCK_WAIT_MS = 21_500;

const foodNutritionResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    dish_name: { type: SchemaType.STRING },
    estimated_weight_g: { type: SchemaType.NUMBER },
    calories: { type: SchemaType.NUMBER },
    protein_g: { type: SchemaType.NUMBER },
    carbs_g: { type: SchemaType.NUMBER },
    fat_g: { type: SchemaType.NUMBER },
    fiber_g: { type: SchemaType.NUMBER },
    sugars_g: { type: SchemaType.NUMBER },
    saturated_fat_g: { type: SchemaType.NUMBER },
    sodium_mg: { type: SchemaType.NUMBER },
    cholesterol_mg: { type: SchemaType.NUMBER },
    confidence: { type: SchemaType.STRING, format: 'enum', enum: ['high', 'medium', 'low'] },
    health_tips: { type: SchemaType.STRING },
    ingredients: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          weight_g: { type: SchemaType.NUMBER },
          calories: { type: SchemaType.NUMBER },
        },
        required: ['name', 'weight_g', 'calories'],
      },
    },
  },
  required: [
    'dish_name', 'estimated_weight_g', 'calories', 'protein_g', 'carbs_g', 'fat_g',
    'fiber_g', 'sugars_g', 'saturated_fat_g', 'sodium_mg', 'cholesterol_mg',
    'confidence', 'health_tips', 'ingredients',
  ],
};

type ScanOutcome = { nutrition: NutritionEstimate; source: VisionScanMetrics['source']; cached: boolean };
type RedisResult<T> = { ok: true; value: T } | { ok: false };
const localScans = new Map<string, Promise<ScanOutcome>>();

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('operation timed out')), timeoutMs);
    timer.unref?.();
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function redisCommand<T>(operation: () => Promise<T>): Promise<RedisResult<T>> {
  try {
    return { ok: true, value: await withTimeout(operation(), REDIS_COMMAND_TIMEOUT_MS) };
  } catch {
    return { ok: false };
  }
}

function safeProviderDiagnostic(cause: any, model?: string) {
  const apiKey = config.geminiApiKey;
  const rawMessage = String(cause?.message || 'No provider message');
  const message = rawMessage
    .replaceAll(apiKey, '[redacted]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9+/=_-]{120,}\b/g, '[redacted data]')
    .slice(0, 600);
  const detail = Array.isArray(cause?.errorDetails) ? cause.errorDetails[0] : undefined;
  return {
    status: Number(cause?.status || cause?.statusCode || cause?.response?.status) || undefined,
    code: typeof detail?.reason === 'string' ? detail.reason.slice(0, 120) : undefined,
    message,
    model,
  };
}

function isTransientProviderError(cause: any): boolean {
  const diagnostic = safeProviderDiagnostic(cause);
  const status = diagnostic.status || 0;
  const message = String(cause?.message || '').toLowerCase();
  const code = String(cause?.code || cause?.cause?.code || '').toUpperCase();
  if (status === 408 || status === 425 || status >= 500) return true;
  if (status === 429) {
    // Use the alternate model for short-window throttling, but do not hide an
    // exhausted project quota or billing limit by repeating the same request.
    return /rate.?limit|too many requests|per minute|requests per|retry in \d+ seconds/.test(message)
      && !/billing|daily quota|quota exceeded|limit: 0/.test(message);
  }
  return cause?.name === 'GoogleGenerativeAIAbortError'
    || /timeout|timed out|deadline|temporarily unavailable|socket hang up/.test(message)
    || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(code);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VisionService {
  static async analyzeFoodImage(
    base64Data: string,
    mimeType = 'image/jpeg',
    onMetrics?: (metrics: VisionScanMetrics) => void,
  ): Promise<NutritionEstimate & { cached?: boolean }> {
    const startedAt = performance.now();
    const metrics: VisionScanMetrics = {
      source: 'primary_success', redisLookupMs: 0, deduplicationWaitMs: 0,
      geminiMs: 0, responseValidationMs: 0, totalMs: 0,
    };
    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '').replace(/\s/g, '');
    const cacheKey = `food_vision:v2:${crypto.createHash('sha256').update(cleanBase64).digest('hex')}`;

    const finish = (outcome: ScanOutcome): NutritionEstimate & { cached: boolean } => {
      metrics.source = outcome.source;
      metrics.totalMs = performance.now() - startedAt;
      try { onMetrics?.({ ...metrics }); } catch { /* Metrics must never fail a scan. */ }
      return { ...outcome.nutrition, cached: outcome.cached };
    };

    try {
      let cacheStarted = performance.now();
      const cached = await this.readValidCache(cacheKey);
      metrics.redisLookupMs += performance.now() - cacheStarted;
      if (cached) return finish({ nutrition: cached, source: 'cache_hit', cached: true });

      const active = localScans.get(cacheKey);
      if (active) {
        const waitingAt = performance.now();
        const outcome = await active;
        metrics.deduplicationWaitMs = performance.now() - waitingAt;
        return finish({ ...outcome, source: 'inflight_deduplicated', cached: false });
      }

      const scan = this.analyzeWithLock(cacheKey, cleanBase64, mimeType, metrics);
      localScans.set(cacheKey, scan);
      try {
        return finish(await scan);
      } finally {
        if (localScans.get(cacheKey) === scan) localScans.delete(cacheKey);
      }
    } finally {
      if (!metrics.totalMs) {
        metrics.totalMs = performance.now() - startedAt;
        try { onMetrics?.({ ...metrics }); } catch { /* Metrics must never fail a scan. */ }
      }
    }
  }

  private static async readValidCache(cacheKey: string): Promise<NutritionEstimate | null> {
    const cached = await redisCommand(() => redis.get(cacheKey));
    if (!cached.ok || !cached.value) return null;
    try {
      return this.normalizeNutrition(JSON.parse(cached.value));
    } catch {
      console.warn('[FoodScan] Discarding invalid cached nutrition result.');
      void redisCommand(() => redis.del(cacheKey));
      return null;
    }
  }

  private static async acquireLock(lockKey: string, token: string): Promise<'acquired' | 'busy' | 'unavailable'> {
    const result = await redisCommand(() => redis.set(lockKey, token, 'PX', REDIS_LOCK_TTL_MS, 'NX'));
    if (!result.ok) return 'unavailable';
    return result.value === 'OK' ? 'acquired' : 'busy';
  }

  private static async analyzeWithLock(
    cacheKey: string,
    cleanBase64: string,
    mimeType: string,
    metrics: VisionScanMetrics,
  ): Promise<ScanOutcome> {
    const lockKey = `${cacheKey}:in_progress`;
    const lockToken = crypto.randomUUID();
    let lockState = await this.acquireLock(lockKey, lockToken);
    let ownsLock = lockState === 'acquired';

    if (lockState === 'busy') {
      const waitStarted = performance.now();
      const waitUntil = waitStarted + LOCK_WAIT_MS;
      while (performance.now() < waitUntil) {
        await delay(LOCK_POLL_MS);
        const cacheStarted = performance.now();
        const cached = await this.readValidCache(cacheKey);
        metrics.redisLookupMs += performance.now() - cacheStarted;
        if (cached) {
          metrics.deduplicationWaitMs = performance.now() - waitStarted;
          return { nutrition: cached, source: 'redis_lock_deduplicated', cached: true };
        }
        lockState = await this.acquireLock(lockKey, lockToken);
        if (lockState === 'acquired') { ownsLock = true; break; }
        if (lockState === 'unavailable') break;
      }
      if (!ownsLock && lockState === 'busy') {
        throw new VisionServiceError('This photo is still being analyzed. Please wait a moment and try again.', 503);
      }
    }

    try {
      // A previous process may have populated the cache between the first read
      // and lock acquisition.
      if (ownsLock) {
        const cacheStarted = performance.now();
        const cached = await this.readValidCache(cacheKey);
        metrics.redisLookupMs += performance.now() - cacheStarted;
        if (cached) return { nutrition: cached, source: 'cache_hit', cached: true };
      }

      const analysis = await this.requestGemini(cleanBase64, mimeType, metrics);
      const cacheWrite = await redisCommand(() => redis.set(
        cacheKey,
        JSON.stringify(analysis.nutrition),
        'EX',
        CACHE_TTL_SECONDS,
      ));
      if (!cacheWrite.ok) console.warn('[FoodScan] Nutrition cache write failed; returning the valid live result.');
      return analysis;
    } finally {
      if (ownsLock) {
        await redisCommand(() => redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          lockKey,
          lockToken,
        ));
      }
    }
  }

  private static async requestGemini(
    cleanBase64: string,
    mimeType: string,
    metrics: VisionScanMetrics,
  ): Promise<ScanOutcome> {
    if (!config.geminiApiKey) {
      throw new VisionServiceError('Food photo analysis is not configured. Set GEMINI_API_KEY on the backend.', 503);
    }
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: foodNutritionResponseSchema,
      maxOutputTokens: 900,
    };
    const prompt = 'Estimate the visible food and edible portion. Return only the requested JSON. Use realistic nutrition estimates; do not guess hidden ingredients. List up to 8 visible ingredients. Keep health_tips to one short practical sentence. Confidence reflects photo clarity and portion uncertainty.';
    const imagePart = { inlineData: { data: cleanBase64, mimeType } };
    const models = [...new Set([config.geminiModel, config.geminiFallbackModel].filter(Boolean))];
    const attemptTimeouts = [config.geminiPrimaryTimeoutMs, config.geminiFallbackTimeoutMs];
    const startedAt = performance.now();
    const deadline = startedAt + config.geminiTotalTimeoutMs;
    let responseText = '';
    let successfulIndex = -1;
    let lastCause: any;

    for (let index = 0; index < models.length; index += 1) {
      const modelName = models[index];
      const remainingMs = deadline - performance.now();
      if (remainingMs <= 0) {
        lastCause = Object.assign(new Error('Gemini total scan deadline exceeded.'), { name: 'GoogleGenerativeAIAbortError' });
        break;
      }
      const attemptStarted = performance.now();
      const timeout = Math.max(1, Math.min(attemptTimeouts[index] || attemptTimeouts[0], remainingMs));
      try {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
        const response = await model.generateContent([prompt, imagePart], { timeout });
        responseText = response.response.text();
        successfulIndex = index;
        if (index === 0) metrics.primaryModelMs = performance.now() - attemptStarted;
        else metrics.fallbackModelMs = performance.now() - attemptStarted;
        break;
      } catch (cause: any) {
        lastCause = cause;
        if (index === 0) metrics.primaryModelMs = performance.now() - attemptStarted;
        else metrics.fallbackModelMs = performance.now() - attemptStarted;
        if (index >= models.length - 1 || !isTransientProviderError(cause)) throw this.mapProviderError(cause, modelName);
      }
    }

    metrics.geminiMs = performance.now() - startedAt;
    if (!responseText || successfulIndex < 0) {
      throw this.mapProviderError(lastCause || new Error('Gemini returned an empty response.'), models[0]);
    }

    const validationStarted = performance.now();
    let nutrition: NutritionEstimate;
    try {
      nutrition = this.normalizeNutrition(JSON.parse(responseText));
    } catch (cause: any) {
      throw new VisionServiceError('Gemini returned an unreadable nutrition estimate. Please try scanning the photo again.', 502, {
        message: String(cause?.message || 'Invalid nutrition response').slice(0, 300),
        model: models[successfulIndex],
      });
    } finally {
      metrics.responseValidationMs = performance.now() - validationStarted;
    }

    const source = successfulIndex === 0 ? 'primary_success' : 'fallback_success';
    metrics.source = source;
    return { nutrition, source, cached: false };
  }

  private static mapProviderError(cause: any, model?: string): VisionServiceError {
    const diagnostic = safeProviderDiagnostic(cause, model);
    const status = diagnostic.status || 0;
    const message = String(cause?.message || '').toLowerCase();
    if (cause?.name === 'GoogleGenerativeAIAbortError' || message.includes('timeout') || message.includes('timed out') || message.includes('deadline')) {
      return new VisionServiceError('Food scan took too long. Please try again on a stable connection.', 504, diagnostic);
    }
    if (status === 429) return new VisionServiceError('Food scanning is temporarily busy. Please try again shortly.', 503, diagnostic);
    if (status === 401 || status === 403) return new VisionServiceError('Food scanner access is not configured correctly. Check the Gemini API key and project access.', 503, diagnostic);
    if (status === 400 || status === 404) return new VisionServiceError('Gemini rejected the food scan request. Check the backend model setting and try again.', 503, diagnostic);
    if (status >= 500 || isTransientProviderError(cause)) return new VisionServiceError('Gemini is temporarily unavailable. Please try the food scan again shortly.', 503, diagnostic);
    return new VisionServiceError('Could not analyze this photo. Please try again with a clear food photo.', 502, diagnostic);
  }

  private static normalizeNutrition(value: any): NutritionEstimate {
    const number = (key: string, max: number) => {
      const result = value?.[key];
      if (typeof result !== 'number' || !Number.isFinite(result) || result < 0 || result > max) {
        throw new Error(`Gemini returned an invalid ${key}.`);
      }
      return Math.round(result * 10) / 10;
    };
    if (!value || typeof value.dish_name !== 'string' || !value.dish_name.trim()) throw new Error('Gemini returned no dish name.');
    if (!['high', 'medium', 'low'].includes(value.confidence)) throw new Error('Gemini returned an invalid confidence level.');
    if (typeof value.health_tips !== 'string') throw new Error('Gemini returned no health tips field.');
    if (!Array.isArray(value.ingredients)) throw new Error('Gemini returned invalid ingredient details.');
    const ingredients = value.ingredients.slice(0, 30).map((ingredient: any, index: number) => {
      if (!ingredient || typeof ingredient.name !== 'string' || !ingredient.name.trim()) throw new Error(`Gemini returned an invalid ingredient at index ${index}.`);
      const weight = ingredient.weight_g;
      const calories = ingredient.calories;
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 10000) throw new Error(`Gemini returned an invalid ingredient weight at index ${index}.`);
      if (typeof calories !== 'number' || !Number.isFinite(calories) || calories < 0 || calories > 20000) throw new Error(`Gemini returned invalid ingredient calories at index ${index}.`);
      return { name: ingredient.name.trim().slice(0, 120), weight_g: Math.round(weight * 10) / 10, calories: Math.round(calories) };
    });
    return {
      dish_name: value.dish_name.trim().slice(0, 200),
      estimated_weight_g: number('estimated_weight_g', 10000),
      calories: Math.round(number('calories', 20000)),
      protein_g: number('protein_g', 1000), carbs_g: number('carbs_g', 2000), fat_g: number('fat_g', 1000),
      fiber_g: number('fiber_g', 1000), sugars_g: number('sugars_g', 1000), saturated_fat_g: number('saturated_fat_g', 1000),
      sodium_mg: number('sodium_mg', 100000), cholesterol_mg: number('cholesterol_mg', 100000),
      confidence: value.confidence,
      health_tips: value.health_tips.slice(0, 1000),
      ingredients,
    };
  }
}
