import {
  UserProfile,
  FitnessProfile,
  UserAchievement,
  UserFitnessStats,
  RecordedActivity,
} from '../types';
import { ACHIEVEMENT_CATALOG } from './achievements';

export class UserStore {
  private static profiles: Record<string, UserProfile> = {};
  private static fitnessProfiles: Record<string, FitnessProfile> = {};
  private static userStats: Record<string, UserFitnessStats> = {};
  private static activities: Record<string, RecordedActivity[]> = {};
  private static achievements: Record<string, Record<string, UserAchievement>> = {};

  /**
   * Initialize a brand-new user with ZERO statistics, ZERO trophies, and empty history.
   */
  static initializeNewUser(
    userId: string,
    phone: string,
    fullName: string,
    country: string = 'United States',
    avatarUrl?: string,
    dateOfBirth?: string,
    gender?: any
  ): UserProfile {
    const newProfile: UserProfile = {
      id: userId,
      phone,
      fullName,
      avatarUrl: avatarUrl || '🏃‍♂️',
      dateOfBirth,
      gender,
      country,
      preferredUnits: 'metric',
      isOnboarded: false,
      streakCount: 0,   // Starts from 0!
      totalPoints: 0,   // Starts from 0!
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Save profile
    this.profiles[userId] = newProfile;

    // 2. Initialize ALL FITNESS STATS TO ZERO
    this.userStats[userId] = {
      userId,
      totalActivities: 0,
      totalDistanceKm: 0,
      totalDurationMinutes: 0,
      totalCaloriesBurned: 0,
      streakDays: 0,
      todaySteps: 0,
      todayStepGoal: 8000,
      todayCalories: 0,
      todayWaterMl: 0,
      todayWaterGoalMl: 2500,
      lastActiveDate: undefined,
    };

    // 3. Initialize ZERO recorded activities
    this.activities[userId] = [];

    // 4. Initialize achievements: ALL LOCKED (0 earned trophies)
    this.achievements[userId] = {};
    ACHIEVEMENT_CATALOG.forEach((def) => {
      this.achievements[userId][def.id] = {
        id: `uach_${userId}_${def.id}`,
        userId,
        achievementId: def.id,
        achievement: def,
        currentValue: 0,
        targetValue: def.targetValue,
        progressPercent: 0,
        isUnlocked: false,
        isShared: false,
      };
    });

    return newProfile;
  }

  // --- Profile methods ---
  static getProfile(userId: string): UserProfile | null {
    return this.profiles[userId] || null;
  }

  static saveProfile(profile: UserProfile): void {
    this.profiles[profile.id] = {
      ...this.profiles[profile.id],
      ...profile,
      updatedAt: new Date().toISOString(),
    };
  }

  // --- Fitness Profile methods ---
  static getFitnessProfile(userId: string): FitnessProfile | null {
    return this.fitnessProfiles[userId] || null;
  }

  static saveFitnessProfile(fitnessProfile: FitnessProfile): void {
    this.fitnessProfiles[fitnessProfile.userId] = fitnessProfile;
  }

  // --- Stats methods (isolated per user) ---
  static getStats(userId: string): UserFitnessStats {
    if (!this.userStats[userId]) {
      // Return zeroed stats if not yet initialized
      this.userStats[userId] = {
        userId,
        totalActivities: 0,
        totalDistanceKm: 0,
        totalDurationMinutes: 0,
        totalCaloriesBurned: 0,
        streakDays: 0,
        todaySteps: 0,
        todayStepGoal: 8000,
        todayCalories: 0,
        todayWaterMl: 0,
        todayWaterGoalMl: 2500,
      };
    }
    return this.userStats[userId];
  }

  static updateStats(userId: string, partial: Partial<UserFitnessStats>): UserFitnessStats {
    const current = this.getStats(userId);
    const updated = { ...current, ...partial };
    this.userStats[userId] = updated;
    return updated;
  }

  // --- Activities methods (isolated per user) ---
  static getActivities(userId: string): RecordedActivity[] {
    return this.activities[userId] || [];
  }

  static addActivity(activity: RecordedActivity): void {
    if (!this.activities[activity.userId]) {
      this.activities[activity.userId] = [];
    }
    this.activities[activity.userId].unshift(activity);

    // Automatically update cumulative stats for THIS user
    const stats = this.getStats(activity.userId);
    const newTotalActivities = stats.totalActivities + 1;
    const newDistance = Math.round((stats.totalDistanceKm + (activity.distanceKm || 0)) * 100) / 100;
    const newDuration = stats.totalDurationMinutes + Math.round(activity.activeDurationSeconds / 60);
    const newCalories = stats.totalCaloriesBurned + (activity.caloriesBurned || 0);
    const newTodayCalories = stats.todayCalories + (activity.caloriesBurned || 0);

    // Approximate step count for outdoor runs/walks if not explicitly counted
    let stepBonus = 0;
    if (activity.sportType === 'running' || activity.sportType === 'walking' || activity.sportType === 'hiking') {
      stepBonus = Math.round(activity.distanceKm * 1300); // avg 1300 steps per km
    }
    const newTodaySteps = stats.todaySteps + stepBonus;
    const newStreak = stats.streakDays === 0 ? 1 : stats.streakDays;

    this.updateStats(activity.userId, {
      totalActivities: newTotalActivities,
      totalDistanceKm: newDistance,
      totalDurationMinutes: newDuration,
      totalCaloriesBurned: newCalories,
      todayCalories: newTodayCalories,
      todaySteps: newTodaySteps,
      streakDays: newStreak,
      lastActiveDate: new Date().toISOString().split('T')[0],
    });

    // Update streak in user profile as well
    const profile = this.getProfile(activity.userId);
    if (profile) {
      this.saveProfile({
        ...profile,
        streakCount: newStreak,
      });
    }
  }

  // --- Achievements methods (isolated per user) ---
  static getUserAchievements(userId: string): Record<string, UserAchievement> {
    if (!this.achievements[userId]) {
      // Initialize zeroed achievement records for this user
      this.achievements[userId] = {};
      ACHIEVEMENT_CATALOG.forEach((def) => {
        this.achievements[userId][def.id] = {
          id: `uach_${userId}_${def.id}`,
          userId,
          achievementId: def.id,
          achievement: def,
          currentValue: 0,
          targetValue: def.targetValue,
          progressPercent: 0,
          isUnlocked: false,
          isShared: false,
        };
      });
    }
    return this.achievements[userId];
  }

  static unlockAchievement(userId: string, achievementId: string): UserAchievement | null {
    const userAchs = this.getUserAchievements(userId);
    const record = userAchs[achievementId];
    if (record && !record.isUnlocked) {
      record.isUnlocked = true;
      record.progressPercent = 100;
      record.currentValue = record.targetValue;
      record.unlockedAt = new Date().toISOString();

      // Award points to this specific user's profile
      const def = record.achievement;
      const profile = this.getProfile(userId);
      if (profile && def) {
        this.saveProfile({
          ...profile,
          totalPoints: (profile.totalPoints || 0) + def.points,
        });
      }
      return record;
    }
    return null;
  }
}
