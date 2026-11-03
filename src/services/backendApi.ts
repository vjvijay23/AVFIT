import { FoodNutritionEstimate, GPSPoint } from '../types';
import { Platform } from 'react-native';
import { SecureStorage } from './secureStorage';
import Config from 'react-native-config';

// Set AVFIT_API_URL in .env to target a local backend during development.
const API_BASE_URL = (Config.AVFIT_API_URL || 'https://avfit-api.onrender.com/api/v1').replace(/\/$/, '');
let authToken: string | null = null;
const AUTH_SESSION_KEY = 'avfit.backend.auth-session';

type SavedAuthSession = { token: string; userId: string };

async function saveAuthSession(session: SavedAuthSession | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (session) await SecureStorage.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(session));
    else await SecureStorage.deleteItemAsync(AUTH_SESSION_KEY);
  } catch {
    // Keep the current session usable even if device secure storage is unavailable.
  }
}

type RequestOptions = RequestInit & {
  authenticated?: boolean;
  onRequestStart?: () => void;
  onResponse?: (response: Response) => void;
};

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true, headers, onRequestStart, onResponse, ...init } = options;
  // Keep the token used by this request stable. Several requests can be in
  // flight during screen loading; one expired-token response must not cause
  // sibling requests to leak the backend's raw auth error to the UI.
  const requestAuthToken = authenticated ? authToken : null;
  // Only label JSON requests that actually carry a body. A bodyless POST with
  // application/json can be rejected by Fastify's JSON parser before the route
  // handler runs (for example, the community post-like endpoint).
  const requestHeaders: Record<string, string> = {
    ...(init.body !== undefined && init.body !== null ? { 'Content-Type': 'application/json' } : {}),
    ...(headers as Record<string, string> | undefined),
  };
  if (requestAuthToken) requestHeaders.Authorization = `Bearer ${requestAuthToken}`;
  onRequestStart?.();
  const requestController = init.signal ? null : new AbortController();
  const requestTimeout = requestController
    ? setTimeout(() => requestController.abort(), 75_000)
    : null;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: requestHeaders,
      ...(requestController ? { signal: requestController.signal } : {}),
    });
  } catch (error: any) {
    if (requestController?.signal.aborted) {
      throw new Error('AVFIT took too long to respond. Check your connection and try again.');
    }
    if (error?.name === 'TypeError') {
      throw new Error('Could not connect to AVFIT. Check your internet connection and try again.');
    }
    throw error;
  } finally {
    if (requestTimeout) clearTimeout(requestTimeout);
  }
  onResponse?.(response);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && requestAuthToken) {
      if (authToken === requestAuthToken) {
        authToken = null;
        await saveAuthSession(null);
      }
      throw new Error('Your sign-in has expired. Sign in again to continue.');
    }
    throw new Error(body?.error || `Backend request failed (${response.status})`);
  }
  return body as T;
}

export const BackendApi = {
  setAuthToken(token: string | null) { authToken = token; },
  clearAuthToken() { authToken = null; },
  hasAuthToken() { return Boolean(authToken); },
  async loginWithPin(phone: string, pin: string) {
    const result = await apiRequest<{ success: boolean; token: string; user: Record<string, any> }>('/auth/pin/login', {
      method: 'POST', authenticated: false, body: JSON.stringify({ phone, pin }),
    });
    authToken = result.token;
    await saveAuthSession({ token: result.token, userId: String(result.user.id) });
    return result;
  },
  setPin(pin: string, confirmation: string) {
    return apiRequest<{ success: boolean; user: Record<string, any> }>('/auth/pin/set', {
      method: 'POST', body: JSON.stringify({ pin, confirmation }),
    });
  },
  async restoreAuthSession(): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    try {
      const raw = await SecureStorage.getItemAsync(AUTH_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Partial<SavedAuthSession>;
      if (typeof session.token !== 'string' || typeof session.userId !== 'string') {
        await SecureStorage.deleteItemAsync(AUTH_SESSION_KEY);
        return null;
      }
      authToken = session.token;
      // A saved token may belong to a different backend (for example, a live
      // Render session opened against a local development API), or may have
      // expired while the app was closed. Validate it before opening screens
      // that immediately request protected user data.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${API_BASE_URL}/auth/profile/${encodeURIComponent(session.userId)}`, {
          headers: { Authorization: `Bearer ${session.token}` },
          signal: controller.signal,
        });
        if ([401, 403, 404].includes(response.status)) {
          authToken = null;
          await SecureStorage.deleteItemAsync(AUTH_SESSION_KEY);
          return null;
        }
      } catch {
        // Preserve a valid cached session during temporary network outages.
      } finally {
        clearTimeout(timeout);
      }
      return session.userId;
    } catch {
      return null;
    }
  },
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/api\/v1$/, '')}/health`);
      return response.ok;
    } catch { return false; }
  },
  async verifyOtp(phone: string, accessToken: string, profile?: { fullName?: string; dateOfBirth?: string; gender?: string; avatarUrl?: string; country?: string }, authMode: 'login' | 'signup' = 'login') {
    const result = await apiRequest<{ success: boolean; token: string; user: { id: string; phone: string; fullName: string; avatarUrl?: string | null; dateOfBirth?: string | null; gender?: string | null; country?: string | null; preferredUnits?: string | null; streakCount: number; isOnboarded?: boolean; isNewUser?: boolean; hasPin?: boolean } }>('/auth/otp/verify', {
      method: 'POST', authenticated: false, body: JSON.stringify({ phone, accessToken, profile, authMode }),
    });
    authToken = result.token;
    await saveAuthSession({ token: result.token, userId: result.user.id });
    return result;
  },
  async updateProfile(profile: { fullName?: string; avatarUrl?: string | null; dateOfBirth?: string | null; gender?: string; country?: string; preferredUnits?: string }) {
    return apiRequest('/auth/profile', { method: 'PATCH', body: JSON.stringify(profile) });
  },
  getProfile(id: string) {
    return apiRequest<{ success: boolean; profile: Record<string, any> }>(`/auth/profile/${encodeURIComponent(id)}`);
  },
  profilePhotoSource(id: string, photoUpdatedAt?: string) {
    const version = photoUpdatedAt ? `?v=${encodeURIComponent(photoUpdatedAt)}` : '';
    return authToken ? {
      uri: `${API_BASE_URL}/auth/profile/${encodeURIComponent(id)}/avatar${version}`,
      headers: { Authorization: `Bearer ${authToken}` },
    } : undefined;
  },
  uploadProfilePhoto(imageBase64: string, mimeType: string) {
    return apiRequest<{ success: boolean; updatedAt: string }>('/auth/profile/avatar', {
      method: 'PUT', body: JSON.stringify({ imageBase64, mimeType }),
    });
  },
  deleteProfilePhoto() {
    return apiRequest<{ success: boolean }>('/auth/profile/avatar', { method: 'DELETE' });
  },
  recordActivity(activity: {
    userId: string; sportType: string; title: string; durationSec: number; distanceKm: number;
    calories: number; avgPace: string; avgSpeedKmh?: number; maxSpeedKmh?: number;
    elevationGainM?: number; routeCoordinates: GPSPoint[]; startTime?: string; endTime?: string;
  }) {
    return apiRequest<{ success: boolean; activity: Record<string, unknown> }>('/activities/record', { method: 'POST', body: JSON.stringify(activity) });
  },
  getActivities(userId: string, limit = 20) {
    return apiRequest<{ success: boolean; activities: Array<Record<string, any>> }>(`/activities/user/${encodeURIComponent(userId)}?limit=${limit}`);
  },
  getActivity(id: string) {
    return apiRequest<{ success: boolean; activity: Record<string, any> }>(`/activities/${encodeURIComponent(id)}`);
  },
  async scanFood(
    imageBase64: string,
    mimeType = 'image/jpeg',
    onRequestStart?: () => void,
  ): Promise<FoodNutritionEstimate & { mealId?: string; cached?: boolean }> {
    const serializationStartedAt = performance.now();
    const body = JSON.stringify({ imageBase64, mimeType });
    const requestJsonSerializationMs = performance.now() - serializationStartedAt;
    const startedAt = performance.now();
    const controller = new AbortController();
    const requestDeadline = setTimeout(() => controller.abort(), 60_000);
    let status: number | undefined;
    const responseMetrics: { serverTiming: string | null } = { serverTiming: null };
    let cacheState = 'unknown';
    try {
      const result = await apiRequest<{ success: boolean; data: FoodNutritionEstimate & { mealId?: string; cached?: boolean } }>('/vision/scan-food', {
        method: 'POST',
        body,
        signal: controller.signal,
        onRequestStart,
        onResponse: (response) => {
          status = response.status;
          responseMetrics.serverTiming = response.headers.get('Server-Timing');
        },
      });
      cacheState = result.data.cached ? 'hit-or-coalesced' : 'miss';
      return result.data;
    } catch (error: any) {
      if (controller.signal.aborted) throw new Error('The food scan request timed out. Check your connection and try again.');
      throw error;
    } finally {
      clearTimeout(requestDeadline);
      const apiRoundTripMs = performance.now() - startedAt;
      const serverTotalMs = Number(responseMetrics.serverTiming?.match(/server-total;dur=([\d.]+)/)?.[1]);
      console.info('[FoodScan] API round trip', {
        apiRoundTripMs: Math.round(apiRoundTripMs),
        requestJsonSerializationMs: Math.round(requestJsonSerializationMs),
        clientToServerResidualMs: Number.isFinite(serverTotalMs) ? Math.max(0, Math.round(apiRoundTripMs - serverTotalMs)) : undefined,
        serverTotalMs: Number.isFinite(serverTotalMs) ? Math.round(serverTotalMs) : undefined,
        status,
        cacheState,
        serverTiming: responseMetrics.serverTiming,
      });
    }
  },
  generateDietPlan(focus?: string) {
    return apiRequest<{ success: boolean; plan: Record<string, any> }>('/diet-plans/generate', { method: 'POST', body: JSON.stringify({ focus }) });
  },
  getLatestDietPlan() {
    return apiRequest<{ success: boolean; plan: Record<string, any> | null }>('/diet-plans/latest');
  },
  updateMeal(id: string, meal: { dishName?: string; portionGrams?: number; calories?: number; proteinG?: number; carbsG?: number; fatG?: number; fiberG?: number; sugarsG?: number; saturatedFatG?: number; sodiumMg?: number; cholesterolMg?: number; confidence?: string; healthTips?: string; ingredients?: Array<{ name: string; weight_g: number; calories: number }>; mealType?: string }) {
    return apiRequest(`/meals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(meal) });
  },
  createMeal(meal: { dishName: string; portionGrams: number; calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; sugarsG?: number; saturatedFatG?: number; sodiumMg?: number; cholesterolMg?: number; confidence?: string; healthTips?: string; ingredients?: Array<{ name: string; weight_g: number; calories: number }>; mealType: string }) {
    return apiRequest('/meals', { method: 'POST', body: JSON.stringify(meal) });
  },
  getMeals(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return apiRequest<{ success: boolean; meals: Array<Record<string, any>> }>(`/meals${query}`);
  },
  saveFitnessProfile(profile: Record<string, unknown>) {
    return apiRequest<{ success: boolean; profile: Record<string, unknown> }>('/fitness/profile', { method: 'PUT', body: JSON.stringify(profile) });
  },
  getFitnessProfile() {
    return apiRequest<{ success: boolean; profile: Record<string, unknown> | null }>('/fitness/profile');
  },
  getDashboard() { return apiRequest<Record<string, unknown>>('/fitness/dashboard'); },
  getTrainingRecommendation(refresh = false) {
    return apiRequest<{ success: boolean; recommendation: Record<string, any> }>(`/training-plan/today${refresh ? '?refresh=true' : ''}`);
  },
  getStravaStatus() {
    return apiRequest<{ success: boolean; configured: boolean; connected: boolean; connection: Record<string, any> | null }>('/strava/status');
  },
  async startStravaConnection() {
    const result = await apiRequest<{ success: boolean; authorizationUrl: string }>('/strava/connect', { method: 'POST' });
    return result.authorizationUrl;
  },
  syncStravaActivities() {
    return apiRequest<{ success: boolean; synced: number; activities: Array<Record<string, any>> }>('/strava/sync', { method: 'POST' });
  },
  getStravaActivities() {
    return apiRequest<{ success: boolean; activities: Array<Record<string, any>> }>('/strava/activities');
  },
  disconnectStrava() {
    return apiRequest<{ success: boolean }>('/strava/connection', { method: 'DELETE' });
  },
  getWorkoutCatalog(filters: { category?: string; difficulty?: string } = {}) {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => Boolean(value)) as Array<[string, string]>).toString();
    return apiRequest<{ success: boolean; workouts: Array<Record<string, any>> }>(`/workouts${query ? `?${query}` : ''}`, { authenticated: false });
  },
  getWorkoutLogs(limit = 20) {
    return apiRequest<{ success: boolean; logs: Array<Record<string, any>> }>(`/workouts/logs?limit=${limit}`);
  },
  completeWorkout(workoutId: string | undefined, durationSeconds: number, caloriesBurned?: number) {
    return apiRequest<{ success: boolean; log: Record<string, any>; newlyUnlocked: Array<Record<string, any>> }>('/workouts/complete', {
      method: 'POST', body: JSON.stringify({ workoutId, durationSeconds, caloriesBurned }),
    });
  },
  getStrengthExercises(equipment?: string, muscle?: string, search?: string) {
    const query = new URLSearchParams(Object.entries({ equipment, muscle, q: search }).filter(([, value]) => Boolean(value)) as Array<[string, string]>).toString();
    return apiRequest<{ success: boolean; exercises: Array<Record<string, any>> }>(`/strength/exercises${query ? `?${query}` : ''}`, { authenticated: false });
  },
  getMyStrengthExercises() {
    return apiRequest<{ success: boolean; exercises: Array<Record<string, any>> }>('/strength/my-exercises');
  },
  getStrengthExercise(exerciseId: string) {
    return apiRequest<{ success: boolean; exercise: Record<string, any> }>(`/strength/exercises/${encodeURIComponent(exerciseId)}`);
  },
  createStrengthExercise(exercise: {
    name: string;
    equipment: string;
    primaryMuscle: string;
    secondaryMuscles?: string[];
    description?: string;
    instructions: string[];
    imageBase64?: string;
    imageMime?: string;
  }) {
    return apiRequest<{ success: boolean; exercise: Record<string, any> }>('/strength/exercises', {
      method: 'POST', body: JSON.stringify(exercise),
    });
  },
  getStrengthExerciseHistory(exerciseId: string) {
    return apiRequest<{ success: boolean; sets: Array<{ setIndex: number; weightKg: number; reps: number; rpe?: number }> }>(`/strength/exercises/${encodeURIComponent(exerciseId)}/history`);
  },
  getStrengthWorkouts(limit = 20) {
    return apiRequest<{ success: boolean; workouts: Array<Record<string, any>> }>(`/strength/workouts?limit=${limit}`);
  },
  getStrengthWorkout(workoutId: string) {
    return apiRequest<{ success: boolean; workout: Record<string, any> }>(`/strength/workouts/${encodeURIComponent(workoutId)}`);
  },
  saveStrengthWorkout(workout: {
    name: string;
    startedAt: string;
    completedAt: string;
    exercises: Array<{
      exerciseId: string;
      sets: Array<{ setType: 'W' | 'N' | 'D' | 'F'; weightKg: number; reps: number; rpe?: number; isCompleted: boolean }>;
    }>;
  }) {
    return apiRequest<{ success: boolean; workout: Record<string, any>; personalRecords: Array<{ exercise: string; metric: string; value: number }>; newlyUnlocked: Array<Record<string, any>> }>('/strength/workouts', {
      method: 'POST', body: JSON.stringify(workout),
    });
  },
  getAchievementCatalog() {
    return apiRequest<{ success: boolean; achievements: Array<Record<string, any>> }>('/achievements/catalog', { authenticated: false });
  },
  getMyAchievements() {
    return apiRequest<{ success: boolean; achievements: Array<Record<string, any>>; summary: Record<string, any> }>('/achievements/me');
  },
  getCommunityPosts(limit = 20, before?: string) {
    const query = new URLSearchParams({ limit: String(limit), ...(before ? { before } : {}) });
    return apiRequest<{ success: boolean; posts: Array<Record<string, any>> }>(`/community/posts?${query}`);
  },
  likeCommunityPost(postId: string) {
    return apiRequest<{ success: boolean; hasLiked: boolean; likesCount: number }>(`/community/posts/${encodeURIComponent(postId)}/likes`, { method: 'POST' });
  },
  createCommunityPost(content: string, visibility: 'public' | 'followers' | 'private' = 'public') {
    return apiRequest(`/community/posts`, { method: 'POST', body: JSON.stringify({ content, visibility, postType: 'general' }) });
  },
  getPostComments(postId: string) {
    return apiRequest<{ success: boolean; comments: Array<Record<string, any>> }>(`/community/posts/${encodeURIComponent(postId)}/comments`);
  },
  createPostComment(postId: string, content: string) {
    return apiRequest(`/community/posts/${encodeURIComponent(postId)}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
  },
  getChallenges() {
    return apiRequest<{ success: boolean; challenges: Array<Record<string, any>> }>('/community/challenges');
  },
  createChallenge(challenge: { title: string; description: string; targetMetric: string; targetValue: number; startDate: string; endDate: string; badgeIcon?: string }) {
    return apiRequest('/community/challenges', { method: 'POST', body: JSON.stringify(challenge) });
  },
  joinChallenge(id: string) {
    return apiRequest(`/community/challenges/${encodeURIComponent(id)}/join`, { method: 'POST' });
  },
  getChallengeLeaderboard(id: string) {
    return apiRequest<{ success: boolean; participants: Array<Record<string, any>> }>(`/community/challenges/${encodeURIComponent(id)}/leaderboard`);
  },
  getFollowing() {
    return apiRequest<{ success: boolean; users: Array<Record<string, any>> }>('/community/users/me/following');
  },
  followUser(id: string) {
    return apiRequest(`/community/users/${encodeURIComponent(id)}/follow`, { method: 'POST' });
  },
  async getWalkingLeaderboard(timeframe: 'alltime' | 'week' = 'alltime', limit = 25) {
    return apiRequest<{ success: boolean; leaderboard: Array<Record<string, any>> }>(`/leaderboard/walking?timeframe=${timeframe}&limit=${limit}`, { authenticated: false });
  },
  recordSteps(userId: string, steps: number) {
    return apiRequest('/leaderboard/steps', { method: 'POST', body: JSON.stringify({ userId, steps }) });
  },
  getStepsLeaderboard(limit = 25) {
    return apiRequest<{ success: boolean; leaderboard: Array<Record<string, any>> }>(`/leaderboard/steps?limit=${limit}`);
  },
  async signOut() {
    authToken = null;
    await saveAuthSession(null);
  },
};
