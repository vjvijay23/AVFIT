import crypto from 'crypto';
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
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
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'VisionServiceError';
  }
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
      temperature: 0.2,
      // Gemini 3 models support low thinking to reduce latency for straightforward extraction.
      thinkingConfig: { thinkingLevel: 'low' },
    } as GenerationConfig;
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

    let nutrition: NutritionEstimate;
    try {
      // Bound upstream latency so a hung provider request does not leave the scanner spinning indefinitely.
      const response = await model.generateContent([prompt, imagePart], { timeout: 8500 });
      const responseText = response.response.text();
      nutrition = this.normalizeNutrition(JSON.parse(responseText));
    } catch (cause: any) {
      const status = Number(cause?.status || cause?.statusCode || 0);
      const message = String(cause?.message || '').toLowerCase();
      if (message.includes('timeout') || message.includes('timed out') || message.includes('deadline')) {
        throw new VisionServiceError('Food scan timed out. Please retry on a stable connection.', 504);
      }
      if (status === 429) {
        throw new VisionServiceError('Food scanning is temporarily busy. Please try again shortly.', 503);
      }
      if (status === 401 || status === 403) {
        throw new VisionServiceError('Food scanning service access is not configured correctly. Please contact support.', 503);
      }
      throw new VisionServiceError('Could not analyze this photo. Choose a clear, well-lit image and try again.', 502);
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
