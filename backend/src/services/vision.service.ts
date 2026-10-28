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
    const cacheKey = `food_vision:${imageHash}`;

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

    // 2. Fallback mock if no API key is configured
    if (!config.geminiApiKey) {
      const mockResult: NutritionEstimate = {
        dish_name: 'Grilled Salmon with Quinoa & Steamed Broccoli',
        estimated_weight_g: 350,
        calories: 540,
        protein_g: 44,
        carbs_g: 46,
        fat_g: 16,
        fiber_g: 6.5,
        confidence: 'high',
        health_tips: 'High-protein, heart-healthy Omega-3 meal with complex carbs.',
        ingredients: [
          { name: 'Atlantic Salmon Fillet', weight_g: 170, calories: 290 },
          { name: 'Steamed Quinoa', weight_g: 110, calories: 155 },
          { name: 'Steamed Broccoli', weight_g: 70, calories: 25 },
          { name: 'Olive Oil Drizzle', weight_g: 8, calories: 70 },
        ],
      };
      const mealId = userId ? await this.saveMeal(userId, mockResult) : undefined;
      return { ...mockResult, cached: false, ...(mealId ? { mealId } : {}) };
    }

    // 3. Call Google Gemini Vision API
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = `
You are a precision sports nutrition and visual food analyzer.
Analyze this meal photo carefully:
1. Identify each food component, side dish, sauce, and beverage present.
2. Estimate the serving weight in grams for each item.
3. Calculate Calories (kcal), Protein (g), Carbohydrates (g), Total Fat (g), and Fiber (g).
4. Provide practical athletic health tips based on the macronutrient profile.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "dish_name": string,
  "estimated_weight_g": number,
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
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
    const nutrition: NutritionEstimate = JSON.parse(responseText);

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
      INSERT INTO meals (user_id, dish_name, portion_grams, calories, protein_g, carbs_g, fat_g, fiber_g, confidence, health_tips, ingredients)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id;
    `;
    const res = await pool.query(query, [userId, nutrition.dish_name, nutrition.estimated_weight_g, nutrition.calories,
      nutrition.protein_g, nutrition.carbs_g, nutrition.fat_g, nutrition.fiber_g, nutrition.confidence,
      nutrition.health_tips, JSON.stringify(nutrition.ingredients)]);
    const count = await pool.query('SELECT COUNT(*)::int count FROM meals WHERE user_id=$1', [userId]);
    await AchievementService.updateMetric(userId, 'meal_count', count.rows[0].count);
    const mealDays = await pool.query('SELECT COUNT(DISTINCT logged_at::date)::int count FROM meals WHERE user_id=$1', [userId]);
    await AchievementService.updateMetric(userId, 'meal_days', mealDays.rows[0].count);
    await StreakService.refresh(userId);
    return res.rows[0]?.id as string | undefined;
  }
}
