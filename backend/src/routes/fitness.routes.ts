import { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import { AchievementService } from '../services/achievement.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

const enumValues = {
  fitnessGoal: ['weight_loss','muscle_gain','general_fitness','endurance','maintenance'],
  fitnessLevel: ['beginner','intermediate','advanced'],
  activityLevel: ['sedentary','lightly_active','moderately_active','very_active'],
  workoutPreference: ['home','gym','outdoor','combination'],
  dietaryPreference: ['non_vegetarian','vegetarian','vegan','pescatarian','keto','halal','other'],
};

export async function fitnessRoutes(app: FastifyInstance) {
  app.get('/profile', { preHandler: requireAuth }, async (request) => {
    const result = await pool.query('SELECT * FROM fitness_profiles WHERE user_id=$1', [authenticatedUserId(request)]);
    return { success: true, profile: result.rows[0] || null };
  });

  app.put<{ Body: Record<string, any> }>('/profile', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authenticatedUserId(request);
    const body = request.body || {};
    const height = Number(body.heightCm);
    const weight = Number(body.weightKg);
    if (!Number.isFinite(height) || height < 80 || height > 250 || !Number.isFinite(weight) || weight < 25 || weight > 350) {
      return reply.status(400).send({ error: 'heightCm must be 80–250 and weightKg must be 25–350.' });
    }
    for (const [key, allowed] of Object.entries(enumValues)) {
      if (body[key] !== undefined && !allowed.includes(body[key])) return reply.status(400).send({ error: `Invalid ${key}.` });
    }
    const profile = await pool.query('SELECT gender,date_of_birth FROM profiles WHERE id=$1', [userId]);
    if (!profile.rows[0]) return reply.status(404).send({ error: 'Profile not found.' });
    const dob = profile.rows[0].date_of_birth ? new Date(profile.rows[0].date_of_birth) : null;
    const age = dob ? Math.max(13, Math.min(100, Math.floor((Date.now() - dob.getTime()) / 31557600000))) : 30;
    const gender = profile.rows[0].gender;
    const bmr = 10 * weight + 6.25 * height - 5 * age + (gender === 'male' ? 5 : gender === 'female' ? -161 : -78);
    const factors: Record<string, number> = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 };
    const tdee = bmr * (factors[body.activityLevel || 'moderately_active'] || 1.55);
    const calorieTarget = Math.round(Math.max(gender === 'female' ? 1200 : 1500, tdee + (body.fitnessGoal === 'weight_loss' ? -500 : body.fitnessGoal === 'muscle_gain' ? 350 : 0)));
    const protein = Math.round(weight * 2);
    const fat = Math.round(calorieTarget * 0.25 / 9);
    const carbs = Math.max(0, Math.round((calorieTarget - protein * 4 - fat * 9) / 4));
    const params = [userId, height, weight, body.targetWeightKg ?? null, body.fitnessGoal || 'general_fitness', body.fitnessLevel || 'beginner', body.activityLevel || 'moderately_active', body.workoutPreference || 'home', body.availableEquipment || ['bodyweight'], body.preferredWorkoutDurationMin || 30, body.weeklyWorkoutFrequencyDays || 4, body.dietaryPreference || 'non_vegetarian', body.allergiesAndRestrictions || [], bmr, tdee, calorieTarget, protein, carbs, fat, body.dailyStepGoal || 10000, Math.round(weight * 35 + 500), body.isPrivate !== false];
    const result = await pool.query(`INSERT INTO fitness_profiles (
      user_id,height_cm,weight_kg,target_weight_kg,fitness_goal,fitness_level,activity_level,workout_preference,available_equipment,
      preferred_workout_duration_min,weekly_workout_frequency_days,dietary_preference,allergies_and_restrictions,bmr,tdee,
      daily_calorie_target,daily_protein_g,daily_carbs_g,daily_fat_g,daily_step_goal,daily_water_ml,is_private)
      VALUES (${params.map((_,i)=>`$${i+1}`).join(',')})
      ON CONFLICT(user_id) DO UPDATE SET height_cm=EXCLUDED.height_cm,weight_kg=EXCLUDED.weight_kg,target_weight_kg=EXCLUDED.target_weight_kg,
      fitness_goal=EXCLUDED.fitness_goal,fitness_level=EXCLUDED.fitness_level,activity_level=EXCLUDED.activity_level,workout_preference=EXCLUDED.workout_preference,
      available_equipment=EXCLUDED.available_equipment,preferred_workout_duration_min=EXCLUDED.preferred_workout_duration_min,
      weekly_workout_frequency_days=EXCLUDED.weekly_workout_frequency_days,dietary_preference=EXCLUDED.dietary_preference,
      allergies_and_restrictions=EXCLUDED.allergies_and_restrictions,bmr=EXCLUDED.bmr,tdee=EXCLUDED.tdee,daily_calorie_target=EXCLUDED.daily_calorie_target,
      daily_protein_g=EXCLUDED.daily_protein_g,daily_carbs_g=EXCLUDED.daily_carbs_g,daily_fat_g=EXCLUDED.daily_fat_g,
      daily_step_goal=EXCLUDED.daily_step_goal,daily_water_ml=EXCLUDED.daily_water_ml,is_private=EXCLUDED.is_private,updated_at=NOW() RETURNING *`, params);
    await pool.query('UPDATE profiles SET is_onboarded=TRUE, updated_at=NOW() WHERE id=$1', [userId]);
    await AchievementService.updateMetric(userId, 'onboarding', 1);
    return { success: true, profile: result.rows[0] };
  });

  app.get('/dashboard', { preHandler: requireAuth }, async (request) => {
    const userId = authenticatedUserId(request);
    const [daily, meals, workouts, fitness, profile] = await Promise.all([
      pool.query('SELECT * FROM daily_activity_logs WHERE user_id=$1 AND log_date=CURRENT_DATE', [userId]),
      pool.query(`SELECT COALESCE(SUM(calories),0)::int calories, COALESCE(SUM(protein_g),0)::float protein_g, COALESCE(SUM(carbs_g),0)::float carbs_g, COALESCE(SUM(fat_g),0)::float fat_g FROM meals WHERE user_id=$1 AND logged_at::date=CURRENT_DATE`, [userId]),
      pool.query('SELECT COUNT(*)::int count FROM workout_logs WHERE user_id=$1 AND completed_at::date=CURRENT_DATE', [userId]),
      pool.query('SELECT daily_calorie_target,daily_protein_g,daily_carbs_g,daily_fat_g,daily_step_goal,daily_water_ml FROM fitness_profiles WHERE user_id=$1', [userId]),
      pool.query('SELECT streak_count FROM profiles WHERE id=$1', [userId]),
    ]);
    return { success: true, activity: daily.rows[0] || { steps: 0, distance_km: 0, calories_burned: 0, active_minutes: 0 }, nutrition: meals.rows[0], workoutsToday: workouts.rows[0].count, targets: fitness.rows[0] || null, streakCount: profile.rows[0]?.streak_count || 0 };
  });
}
