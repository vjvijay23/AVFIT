import { FoodNutritionEstimate, GPSPoint } from '../types';

// Point the app at the deployed API by default. Set EXPO_PUBLIC_API_URL to a local
// backend URL when developing against a local server (Android emulator: 10.0.2.2).
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://avfit-api.onrender.com/api/v1').replace(/\/$/, '');
let authToken: string | null = null;

type RequestOptions = RequestInit & { authenticated?: boolean };

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true, headers, ...init } = options;
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...(headers as Record<string, string> | undefined) };
  if (authenticated && authToken) requestHeaders.Authorization = `Bearer ${authToken}`;
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: requestHeaders });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Backend request failed (${response.status})`);
  return body as T;
}

export const BackendApi = {
  setAuthToken(token: string | null) { authToken = token; },
  hasAuthToken() { return Boolean(authToken); },
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/api\/v1$/, '')}/health`);
      return response.ok;
    } catch { return false; }
  },
  sendOtp(phone: string) {
    return apiRequest<{ success: boolean; message: string; phone: string; isMockOtp?: boolean; developmentOtp?: string }>('/auth/otp/send', {
      method: 'POST', authenticated: false, body: JSON.stringify({ phone }),
    });
  },
  async verifyOtp(phone: string, otp: string, profile?: { fullName?: string; dateOfBirth?: string; gender?: string; avatarUrl?: string; country?: string }, authMode: 'login' | 'signup' = 'login') {
    const result = await apiRequest<{ success: boolean; token: string; user: { id: string; phone: string; fullName: string; avatarUrl?: string | null; dateOfBirth?: string | null; gender?: string | null; country?: string | null; preferredUnits?: string | null; streakCount: number; isOnboarded?: boolean; isNewUser?: boolean } }>('/auth/otp/verify', {
      method: 'POST', authenticated: false, body: JSON.stringify({ phone, otp, profile, authMode }),
    });
    authToken = result.token;
    return result;
  },
  async updateProfile(profile: { fullName?: string; avatarUrl?: string | null; dateOfBirth?: string | null; gender?: string; country?: string; preferredUnits?: string }) {
    return apiRequest('/auth/profile', { method: 'PATCH', body: JSON.stringify(profile) });
  },
  getProfile(id: string) {
    return apiRequest<{ success: boolean; profile: Record<string, any> }>(`/auth/profile/${encodeURIComponent(id)}`);
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
  async scanFood(imageBase64: string, mimeType = 'image/jpeg'): Promise<FoodNutritionEstimate & { mealId?: string; cached?: boolean }> {
    const result = await apiRequest<{ success: boolean; data: FoodNutritionEstimate & { mealId?: string; cached?: boolean } }>('/vision/scan-food', {
      method: 'POST', body: JSON.stringify({ imageBase64, mimeType }),
    });
    return result.data;
  },
  updateMeal(id: string, meal: { dishName?: string; portionGrams?: number; calories?: number; proteinG?: number; carbsG?: number; fatG?: number; fiberG?: number; mealType?: string }) {
    return apiRequest(`/meals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(meal) });
  },
  createMeal(meal: { dishName: string; portionGrams: number; calories: number; proteinG: number; carbsG: number; fatG: number; fiberG: number; mealType: string }) {
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
  async signOut() { authToken = null; },
};
