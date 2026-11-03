import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { config } from '../config/index.js';
import { pool } from '../db/index.js';

const recommendationSchema = z.object({
  headline: z.string().min(1).max(120),
  activity_type: z.enum(['strength', 'run', 'walk', 'mobility', 'recovery', 'rest']),
  duration_minutes: z.number().int().min(0).max(120),
  intensity: z.enum(['easy', 'moderate', 'challenging', 'rest']),
  reason: z.string().min(1).max(420),
  workout: z.array(z.string().min(1).max(180)).max(8),
  tomorrow: z.string().min(1).max(420),
  nutrition_note: z.string().min(1).max(300),
});

export class TrainingRecommendationService {
  static async today(userId: string, refresh = false) {
    const cached = await pool.query(`SELECT recommendation, created_at FROM training_recommendations WHERE user_id=$1 AND plan_date=CURRENT_DATE`, [userId]);
    if (cached.rows[0] && !refresh && cached.rows[0].recommendation?.roadmap) {
      return { ...cached.rows[0].recommendation, generatedAt: cached.rows[0].created_at, cached: true };
    }

    if (!config.geminiApiKey) {
      const error = new Error('AI training suggestions are not configured. Set GEMINI_API_KEY on the backend.');
      (error as Error & { statusCode?: number }).statusCode = 503;
      throw error;
    }
    const [profileResult, workoutsResult, activitiesResult, mealsResult] = await Promise.all([
      pool.query(`SELECT height_cm, weight_kg, target_weight_kg, goal_timeline_months, fitness_goal, fitness_level, activity_level, workout_preference, available_equipment, preferred_workout_duration_min, weekly_workout_frequency_days, daily_calorie_target, daily_protein_g, daily_carbs_g, daily_fat_g FROM fitness_profiles WHERE user_id=$1`, [userId]),
      pool.query(`SELECT workout_title, duration_seconds, completed_at FROM workout_logs WHERE user_id=$1 AND completed_at >= NOW() - INTERVAL '14 days' ORDER BY completed_at DESC LIMIT 12`, [userId]),
      pool.query(`SELECT sport_type, title, duration_sec, distance_km, start_time FROM recorded_activities WHERE user_id=$1 AND start_time >= NOW() - INTERVAL '14 days' ORDER BY start_time DESC LIMIT 12`, [userId]),
      pool.query(`SELECT COALESCE(SUM(calories),0)::int calories, COALESCE(SUM(protein_g),0)::float protein_g, COALESCE(SUM(carbs_g),0)::float carbs_g, COALESCE(SUM(fat_g),0)::float fat_g FROM meals WHERE user_id=$1 AND logged_at::date=CURRENT_DATE`, [userId]),
    ]);
    const profile = profileResult.rows[0];
    if (!profile) {
      const error = new Error('Complete your fitness profile to get a personalized training plan.');
      (error as Error & { statusCode?: number }).statusCode = 409;
      throw error;
    }
    const context = {
      date: new Date().toISOString().slice(0, 10),
      profile,
      recentStrengthWorkouts: workoutsResult.rows,
      recentOutdoorActivities: activitiesResult.rows,
      nutritionLoggedToday: mealsResult.rows[0],
      goalRoadmap: createGoalRoadmap(profile),
    };
    const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
      model: config.geminiModel,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.35 },
    });
    const prompt = `Create a safe, practical workout recommendation for today and a brief next-day preview for an AVFIT user. Build it from the user's AVFIT profile, chosen fitness goal, current and target weight, target timeline, AVFIT-recorded sessions, and today's logged macros. Strava is a separate optional integration: never require, query, infer, or use Strava data for this plan. Avoid repeating hard training of the same type on consecutive days; use rest or mobility when recent workload suggests recovery. Match available equipment, workout preference, experience and duration. Do not invent medical conditions, performance metrics, or unlogged nutrition. If no history exists, give a conservative beginner-friendly starter. Nutrition note should compare today's consumed calories/protein/carbs/fat to saved targets and suggest a simple balanced next step; never prescribe extreme restriction. Include a short actionable session (warm-up and exercises or intervals), never claim certainty. JSON only: {"headline":string,"activity_type":"strength"|"run"|"walk"|"mobility"|"recovery"|"rest","duration_minutes":integer,"intensity":"easy"|"moderate"|"challenging"|"rest","reason":string,"workout":[string],"tomorrow":string,"nutrition_note":string}. If rest, duration_minutes must be 0 and workout should contain recovery suggestions. Context: ${JSON.stringify(context)}`;
    let recommendation: z.infer<typeof recommendationSchema>;
    try {
      recommendation = recommendationSchema.parse(JSON.parse((await model.generateContent(prompt)).response.text()));
    } catch (cause) {
      const error = new Error('Gemini could not create a valid training suggestion. Please try again.', { cause });
      (error as Error & { statusCode?: number }).statusCode = 502;
      throw error;
    }
    const savedRecommendation = { ...recommendation, roadmap: context.goalRoadmap };
    const saved = await pool.query(`INSERT INTO training_recommendations(user_id,plan_date,recommendation,model)
      VALUES($1,CURRENT_DATE,$2::jsonb,$3) ON CONFLICT(user_id,plan_date) DO UPDATE SET recommendation=EXCLUDED.recommendation,model=EXCLUDED.model,created_at=NOW()
      RETURNING recommendation,created_at`, [userId, JSON.stringify(savedRecommendation), config.geminiModel]);
    return { ...saved.rows[0].recommendation, generatedAt: saved.rows[0].created_at, cached: false };
  }
}

function createGoalRoadmap(profile: Record<string, any>) {
  const current = Number(profile.weight_kg);
  const target = profile.target_weight_kg == null ? null : Number(profile.target_weight_kg);
  const months = Math.max(1, Math.min(24, Number(profile.goal_timeline_months) || 3));
  if (!Number.isFinite(current) || target === null || !Number.isFinite(target)) {
    return { months, summary: 'Add a target weight in your profile to create a personalized progress roadmap.', milestones: [] as string[] };
  }
  const delta = target - current;
  const direction = delta < 0 ? 'lose' : delta > 0 ? 'gain' : 'maintain';
  const milestones = Array.from({ length: Math.min(months, 6) }, (_, index) => {
    const month = Math.max(1, Math.round(((index + 1) * months) / Math.min(months, 6)));
    const projected = Math.round((current + delta * (month / months)) * 10) / 10;
    return `Month ${month}: review progress toward about ${projected} kg`;
  });
  const weeklyRate = Math.round((Math.abs(delta) / (months * 4.345)) * 100) / 100;
  return {
    months,
    summary: `${direction === 'maintain' ? 'Maintain' : `${direction[0].toUpperCase()}${direction.slice(1)} ${Math.abs(delta).toFixed(1)} kg`} over ${months} month${months === 1 ? '' : 's'} (about ${weeklyRate} kg/week). Use this as a progress estimate and review it with a qualified professional if the pace feels unsuitable.`,
    milestones,
  };
}
