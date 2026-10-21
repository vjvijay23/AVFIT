export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
  dailyStepGoal: number;
  dailyCalorieTarget: number;
  dailyProteinTargetG: number;
  dailyCarbsTargetG: number;
  dailyFatTargetG: number;
  streakCount: number;
}

export interface DailyActivity {
  steps: number;
  stepGoal: number;
  distanceKm: number;
  caloriesBurned: number;
  activeMinutes: number;
  waterIntakeMl: number;
  waterGoalMl: number;
}

export interface FoodNutritionEstimate {
  dish_name: string;
  estimated_weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: 'high' | 'medium' | 'low';
  health_tips?: string;
  ingredients?: Array<{
    name: string;
    weight_g: number;
    calories: number;
  }>;
}

export interface WorkoutRoutine {
  id: string;
  title: string;
  category: 'HIIT' | 'Strength' | 'Core' | 'Mobility';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  durationMinutes: number;
  caloriesBurned: number;
  exerciseCount: number;
  exercises: Array<{
    name: string;
    durationOrReps: string;
    restSeconds: number;
    tip: string;
  }>;
}

export interface CommunityPost {
  id: string;
  authorName: string;
  authorAvatar: string;
  timeAgo: string;
  content: string;
  postType: 'workout' | 'food' | 'steps' | 'general';
  mediaUrl?: string;
  metricBadge?: string;
  likesCount: number;
  commentsCount: number;
  hasLiked: boolean;
}
