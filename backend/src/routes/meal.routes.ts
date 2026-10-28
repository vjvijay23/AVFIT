import { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import { AchievementService } from '../services/achievement.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';
import { StreakService } from '../services/streak.service.js';

const allowedMeals = ['breakfast','lunch','dinner','snack'];

export async function mealRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { date?: string } }>('/', { preHandler: requireAuth }, async (request) => {
    const result = await pool.query(`SELECT * FROM meals WHERE user_id=$1 AND ($2::date IS NULL OR logged_at::date=$2::date) ORDER BY logged_at DESC LIMIT 100`, [authenticatedUserId(request), request.query.date || null]);
    return { success: true, count: result.rows.length, meals: result.rows };
  });

  app.post<{ Body: Record<string, any> }>('/', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body || {};
    const name = String(body.dishName || '').trim();
    const calories = Number(body.calories);
    if (!name || name.length > 200 || !Number.isFinite(calories) || calories < 0 || calories > 10000) return reply.status(400).send({ error: 'dishName and valid calories (0–10000) are required.' });
    const mealType = body.mealType || 'lunch';
    if (!allowedMeals.includes(mealType)) return reply.status(400).send({ error: 'mealType must be breakfast, lunch, dinner, or snack.' });
    const userId = authenticatedUserId(request);
    const result = await pool.query(`INSERT INTO meals (user_id,dish_name,portion_grams,calories,protein_g,carbs_g,fat_g,fiber_g,sugars_g,saturated_fat_g,sodium_mg,cholesterol_mg,confidence,health_tips,ingredients,meal_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [userId,name,body.portionGrams ?? 250,calories,body.proteinG ?? 0,body.carbsG ?? 0,body.fatG ?? 0,body.fiberG ?? 0,body.sugarsG ?? 0,body.saturatedFatG ?? 0,body.sodiumMg ?? 0,body.cholesterolMg ?? 0,body.confidence || 'manual',body.healthTips || null,JSON.stringify(body.ingredients || []),mealType]);
    const count = await pool.query('SELECT COUNT(*)::int count FROM meals WHERE user_id=$1', [userId]);
    const newlyUnlocked = await AchievementService.updateMetric(userId, 'meal_count', count.rows[0].count);
    const mealDays = await pool.query('SELECT COUNT(DISTINCT logged_at::date)::int count FROM meals WHERE user_id=$1', [userId]);
    await AchievementService.updateMetric(userId, 'meal_days', mealDays.rows[0].count);
    await StreakService.refresh(userId);
    return reply.status(201).send({ success: true, meal: result.rows[0], newlyUnlocked });
  });

  app.put<{ Params: { id: string }; Body: Record<string, any> }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body || {};
    const fields: Record<string, [string, unknown]> = {
      dishName: ['dish_name', body.dishName], portionGrams: ['portion_grams', body.portionGrams], calories: ['calories', body.calories],
      proteinG: ['protein_g', body.proteinG], carbsG: ['carbs_g', body.carbsG], fatG: ['fat_g', body.fatG], fiberG: ['fiber_g', body.fiberG],
      sugarsG: ['sugars_g', body.sugarsG], saturatedFatG: ['saturated_fat_g', body.saturatedFatG], sodiumMg: ['sodium_mg', body.sodiumMg], cholesterolMg: ['cholesterol_mg', body.cholesterolMg], mealType: ['meal_type', body.mealType],
    };
    const updates = Object.values(fields).filter(([,value]) => value !== undefined);
    if (!updates.length) return reply.status(400).send({ error: 'Provide at least one meal field to update.' });
    if (body.mealType && !allowedMeals.includes(body.mealType)) return reply.status(400).send({ error: 'Invalid mealType.' });
    const result = await pool.query(`UPDATE meals SET ${updates.map(([column],i)=>`${column}=$${i+1}`).join(',')} WHERE id=$${updates.length+1} AND user_id=$${updates.length+2} RETURNING *`, [...updates.map(([,value])=>value),request.params.id,authenticatedUserId(request)]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'Meal not found.' });
    return { success: true, meal: result.rows[0] };
  });
}
