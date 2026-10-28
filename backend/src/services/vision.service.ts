import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import { pool, redis } from '../db/index.js';
import { AchievementService } from './achievement.service.js';
import { StreakService } from './streak.service.js';

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

export class VisionService {
  /**
   * Analyze meal photo, returning exact macros, weight, and ingredients
   */
  static async analyzeFoodImage(
    base64Data: string,
    mimeType = 'image/jpeg',
    userId?: string
  ): Promise<NutritionEstimate & { cached?: boolean; mealId?: string }> {
    // 1. Calculate image hash to check Redis cache
    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const imageHash = crypto.createHash('sha256').update(cleanBase64).digest('hex');
    const cacheKey = `food_vision:v2:${imageHash}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[VisionService] Cache HIT for image hash ${imageHash.slice(0, 8)}`);
        const parsed = JSON.parse(cached);
        const mealId = userId ? await this.saveMeal(userId, parsed) : undefined;
        return { ...parsed, cached: true, ...(mealId ? { mealId } : {}) };
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
    const model = genAI.getGenerativeModel({
      model: config.geminiModel,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = `
You are a precision sports nutrition and visual food analyzer.
Analyze this meal photo carefully:
1. Identify each food component, side dish, sauce, and beverage present.
2. Estimate the serving weight in grams for each item.
3. Estimate Calories (kcal), Protein (g), Carbohydrates (g), Total Fat (g), Fiber (g), Total Sugars (g), Saturated Fat (g), Sodium (mg), and Cholesterol (mg).
4. Treat all amounts as estimates because a photo cannot confirm exact ingredients, hidden oils, or brands. Use confidence "low" when food or portion size is unclear.
5. Provide practical health tips based on the macronutrient profile.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "dish_name": string,
  "estimated_weight_g": number,
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "sugars_g": number,
  "saturated_fat_g": number,
  "sodium_mg": number,
  "cholesterol_mg": number,
  "confidence": "high" | "medium" | "low",
  "health_tips": string,
  "ingredients": [
    { "name": string, "weight_g": number, "calories": number }
  ]
}
`;

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType || 'image/jpeg',
      },
    };

    const response = await model.generateContent([prompt, imagePart]);
    const responseText = response.response.text();
    const nutrition = this.normalizeNutrition(JSON.parse(responseText));

    // 4. Cache in Redis for 7 days (604800 seconds)
    try {
      await redis.set(cacheKey, JSON.stringify(nutrition), 'EX', 604800);
    } catch (err) {
      console.warn('[Redis] Failed to cache vision result:', err);
    }

    // 5. If userId provided, save meal into PostgreSQL
    const mealId = userId ? await this.saveMeal(userId, nutrition) : undefined;

    return { ...nutrition, cached: false, mealId };
  }

  private static async saveMeal(userId: string, nutrition: NutritionEstimate) {
    const query = `
      INSERT INTO meals (user_id, dish_name, portion_grams, calories, protein_g, carbs_g, fat_g, fiber_g, sugars_g, saturated_fat_g, sodium_mg, cholesterol_mg, confidence, health_tips, ingredients)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id;
    `;
    const res = await pool.query(query, [userId, nutrition.dish_name, nutrition.estimated_weight_g, nutrition.calories,
      nutrition.protein_g, nutrition.carbs_g, nutrition.fat_g, nutrition.fiber_g, nutrition.sugars_g, nutrition.saturated_fat_g,
      nutrition.sodium_mg, nutrition.cholesterol_mg, nutrition.confidence, nutrition.health_tips, JSON.stringify(nutrition.ingredients)]);
    const count = await pool.query('SELECT COUNT(*)::int count FROM meals WHERE user_id=$1', [userId]);
    await AchievementService.updateMetric(userId, 'meal_count', count.rows[0].count);
    const mealDays = await pool.query('SELECT COUNT(DISTINCT logged_at::date)::int count FROM meals WHERE user_id=$1', [userId]);
    await AchievementService.updateMetric(userId, 'meal_days', mealDays.rows[0].count);
    await StreakService.refresh(userId);
    return res.rows[0]?.id as string | undefined;
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
