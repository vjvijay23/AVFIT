import crypto from 'crypto';
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
  ingredients: Array<{
    name: string;
    weight_g: number;
    calories: number;
  }>;
}

export class VisionServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly providerDiagnostic?: {
      status?: number;
      code?: string;
      message?: string;
    },
  ) {
    super(message);
    this.name = 'VisionServiceError';
  }
}

const GEMINI_ANALYSIS_TIMEOUT_MS = 20_000;

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

function safeProviderDiagnostic(cause: any) {
  const apiKey = config.geminiApiKey;
  const rawMessage = String(cause?.message || 'No provider message');
  const message = rawMessage
    .replaceAll(apiKey, '[redacted]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9+/=_-]{120,}\b/g, '[redacted data]')
    .slice(0, 600);
  const detail = Array.isArray(cause?.errorDetails) ? cause.errorDetails[0] : undefined;
  return {
    status: Number(cause?.status || cause?.statusCode) || undefined,
    code: typeof detail?.reason === 'string' ? detail.reason.slice(0, 120) : undefined,
    message,
  };
}

export class VisionService {
  /**
   * Analyze meal photo, returning exact macros, weight, and ingredients
   */
  static async analyzeFoodImage(
    base64Data: string,
    mimeType = 'image/jpeg'
  ): Promise<NutritionEstimate & { cached?: boolean }> {
    // 1. Calculate image hash to check Redis cache
    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const imageHash = crypto.createHash('sha256').update(cleanBase64).digest('hex');
    const cacheKey = `food_vision:v2:${imageHash}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[VisionService] Cache HIT for image hash ${imageHash.slice(0, 8)}`);
        const parsed = JSON.parse(cached);
        return { ...parsed, cached: true };
      }
    } catch (err) {
      console.warn('[Redis] Cache read failed, proceeding with live AI call:', err);
    }

    // Never present a canned sample as if it came from the user's photo.
    if (!config.geminiApiKey) {
      const error = new Error('Food photo analysis is not configured. Set GEMINI_API_KEY on the backend.');
      (error as Error & { statusCode?: number }).statusCode = 503;
      throw error;
    }

    // 3. Call Google Gemini Vision API
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: foodNutritionResponseSchema,
      maxOutputTokens: 1200,
      // Avoid custom sampling parameters here: Gemini 3.6+ ignores these and
      // newer API revisions may reject them. The schema keeps the response compact.
    };
    const model = genAI.getGenerativeModel({
      model: config.geminiModel,
      generationConfig,
    });

    const prompt = 'Estimate the visible meal and portion from this photo. Return only JSON with fields dish_name, estimated_weight_g, calories, protein_g, carbs_g, fat_g, fiber_g, sugars_g, saturated_fat_g, sodium_mg, cholesterol_mg, confidence (high|medium|low), health_tips, and ingredients (up to 8 objects with name, weight_g, calories). Use realistic estimates; a photo cannot reveal hidden ingredients. Keep health_tips brief.';

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType || 'image/jpeg',
      },
    };

    let responseText: string;
    try {
      // Mobile networks and cold provider requests can exceed 8 seconds. Keep a
      // finite timeout, but do not turn normal Gemini latency into a scan failure.
      const response = await model.generateContent([prompt, imagePart], { timeout: GEMINI_ANALYSIS_TIMEOUT_MS });
      responseText = response.response.text();
    } catch (cause: any) {
      const diagnostic = safeProviderDiagnostic(cause);
      const status = diagnostic.status || 0;
      const message = String(cause?.message || '').toLowerCase();
      if (message.includes('timeout') || message.includes('timed out') || message.includes('deadline')) {
        throw new VisionServiceError('Food scan took too long. Please try again on a stable connection.', 504, diagnostic);
      }
      if (status === 429) {
        throw new VisionServiceError('Food scanning is temporarily busy. Please try again shortly.', 503, diagnostic);
      }
      if (status === 401 || status === 403) {
        throw new VisionServiceError('Food scanner access is not configured correctly. Check the Gemini API key and project access.', 503, diagnostic);
      }
      if (status === 400 || status === 404) {
        throw new VisionServiceError('Gemini rejected the food scan request. Check the backend model setting and try again.', 503, diagnostic);
      }
      if (status >= 500) {
        throw new VisionServiceError('Gemini is temporarily unavailable. Please try the food scan again shortly.', 503, diagnostic);
      }
      throw new VisionServiceError('Could not analyze this photo. Please try again with a clear food photo.', 502, diagnostic);
    }

    let nutrition: NutritionEstimate;
    try {
      nutrition = this.normalizeNutrition(JSON.parse(responseText));
    } catch (cause: any) {
      throw new VisionServiceError(
        'Gemini returned an unreadable nutrition estimate. Please try scanning the photo again.',
        502,
        { message: String(cause?.message || 'Invalid nutrition response').slice(0, 300) },
      );
    }

    // Cache asynchronously so Redis latency cannot delay the scan result.
    void redis.set(cacheKey, JSON.stringify(nutrition), 'EX', 604800).catch(() => {
      console.warn('[Redis] Could not cache food vision result.');
    });

    return { ...nutrition, cached: false };
  }

  private static normalizeNutrition(value: any): NutritionEstimate {
    const number = (key: string, max: number) => {
      const result = Number(value?.[key]);
      if (!Number.isFinite(result) || result < 0 || result > max) throw new Error(`Gemini returned an invalid ${key}.`);
      return Math.round(result * 10) / 10;
    };
    if (!value || typeof value.dish_name !== 'string' || !value.dish_name.trim()) throw new Error('Gemini returned no dish name.');
    if (!Array.isArray(value.ingredients)) throw new Error('Gemini returned invalid ingredient details.');
    const confidence = ['high', 'medium', 'low'].includes(value.confidence) ? value.confidence : 'low';
    return {
      dish_name: value.dish_name.trim().slice(0, 200),
      estimated_weight_g: number('estimated_weight_g', 10000),
      calories: Math.round(number('calories', 20000)),
      protein_g: number('protein_g', 1000), carbs_g: number('carbs_g', 2000), fat_g: number('fat_g', 1000),
      fiber_g: number('fiber_g', 1000), sugars_g: number('sugars_g', 1000), saturated_fat_g: number('saturated_fat_g', 1000),
      sodium_mg: number('sodium_mg', 100000), cholesterol_mg: number('cholesterol_mg', 100000),
      confidence: confidence as NutritionEstimate['confidence'],
      health_tips: typeof value.health_tips === 'string' ? value.health_tips.slice(0, 1000) : '',
      ingredients: value.ingredients.slice(0, 30).map((ingredient: any) => ({
        name: String(ingredient?.name || 'Food item').slice(0, 120),
        weight_g: Math.round(Math.max(0, Math.min(10000, Number(ingredient?.weight_g) || 0)) * 10) / 10,
        calories: Math.round(Math.max(0, Math.min(20000, Number(ingredient?.calories) || 0))),
      })),
    };
  }
}
