import { supabase } from './supabase';
import { AuthUser, PhoneAuthRequest, OtpVerifyRequest, UserProfile, Gender } from '../types';
import { UserStore } from './userStore';
import { BackendApi } from './backendApi';

export interface PendingSignupData {
  fullName: string;
  phone: string;
  countryCode: string;
  dateOfBirth?: string;
  gender?: Gender;
  avatarUrl?: string;
  country?: string;
}

// Active session holder in memory (null by default so new sessions do not inherit another user's data)
let currentActiveUserId: string | null = null;

// Phone to User ID mapping for returning logins
const phoneToUserIdMap: Record<string, string> = {
  '+1 (555) 019-2834': 'usr_vyalwin_001',
  '+15550192834': 'usr_vyalwin_001',
  '+919876543210': 'usr_vyalwin_001',
};

export const AuthService = {
  /**
   * Get the active authenticated user's ID
   */
  getActiveUserId(): string {
    return currentActiveUserId || '';
  },

  /**
   * Request an OTP via SMS to the specified phone number.
   */
  async sendPhoneOtp(
    request: PhoneAuthRequest,
    _authMode: 'login' | 'signup' = 'login'
  ): Promise<{ success: boolean; message: string; isMock: boolean; developmentOtp?: string }> {
    const fullPhone = request.phone.trim();
    if (!fullPhone || fullPhone.length < 8) {
      throw new Error('Please enter a valid mobile phone number with country code.');
    }

    const response = await BackendApi.sendOtp(fullPhone);
    return {
      success: true,
      message: response.message,
      isMock: Boolean(response.isMockOtp),
      ...(response.developmentOtp ? { developmentOtp: response.developmentOtp } : {}),
    };
  },

  /**
   * Verify the 6-digit OTP code for the phone number.
   * New users are initialized with 0 stats and 0 trophies.
   * Returning users retain their existing statistics.
   */
  async verifyPhoneOtp(
    request: OtpVerifyRequest,
    pendingProfile?: PendingSignupData,
    authMode: 'login' | 'signup' = 'login'
  ): Promise<{ success: boolean; user: AuthUser; isNewUser: boolean; profile: UserProfile }> {
    const { phone, token } = request;
    const cleanToken = token.trim();

    if (cleanToken.length !== 6) {
      throw new Error('Please enter the complete 6-digit verification code.');
    }

    const response = await BackendApi.verifyOtp(phone, cleanToken, pendingProfile?.fullName);
    const isNewUser = response.user.isNewUser ?? authMode === 'signup';
    const userId = response.user.id;
    currentActiveUserId = userId;
    phoneToUserIdMap[phone] = userId;
    if (pendingProfile) {
      await BackendApi.updateProfile({
        fullName: pendingProfile.fullName,
        avatarUrl: pendingProfile.avatarUrl,
        dateOfBirth: pendingProfile.dateOfBirth,
        gender: pendingProfile.gender,
        country: pendingProfile.country,
      });
    }

    const existing = UserStore.getProfile(userId);
    const profile = existing || UserStore.initializeNewUser(
      userId,
      response.user.phone,
      response.user.fullName || pendingProfile?.fullName || 'New Athlete',
      pendingProfile?.country || 'United States',
      response.user.avatarUrl || pendingProfile?.avatarUrl || '🏃‍♂️',
      pendingProfile?.dateOfBirth,
      pendingProfile?.gender
    );
    const normalizedProfile = await this.saveUserProfile({
      ...profile,
      phone: response.user.phone,
      fullName: response.user.fullName || profile.fullName,
      avatarUrl: response.user.avatarUrl || profile.avatarUrl,
      streakCount: response.user.streakCount || 0,
      isOnboarded: response.user.isOnboarded ?? profile.isOnboarded,
    });

    const authUser: AuthUser = {
      id: userId,
      phone: response.user.phone,
      countryCode: response.user.phone.slice(0, 3) || '+1',
      isPhoneVerified: true,
      isOnboarded: normalizedProfile.isOnboarded,
      createdAt: normalizedProfile.createdAt,
    };

    return {
      success: true,
      user: authUser,
      isNewUser,
      profile: normalizedProfile,
    };
  },

  /**
   * Get the currently active authenticated user.
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!currentActiveUserId) return null;
    const profile = UserStore.getProfile(currentActiveUserId);
    if (!profile) return null;

    return {
      id: profile.id,
      phone: profile.phone,
      countryCode: profile.phone.slice(0, 3) || '+1',
      isPhoneVerified: true,
      isOnboarded: profile.isOnboarded,
      createdAt: profile.createdAt,
    };
  },

  /**
   * Fetch user profile details for active or specified user.
   */
  async getUserProfile(userId?: string): Promise<UserProfile> {
    const targetId = userId || currentActiveUserId;
    if (!targetId) {
      // Default initial zero-state athlete profile
      return {
        id: 'usr_guest',
        phone: '',
        fullName: 'Athlete',
        avatarUrl: '🏃‍♂️',
        age: 24,
        country: 'United States',
        preferredUnits: 'metric',
        isOnboarded: false,
        streakCount: 0,
        totalPoints: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    let profile = UserStore.getProfile(targetId);

    if (BackendApi.hasAuthToken() && targetId === currentActiveUserId) {
      try {
        const result = await BackendApi.getProfile(targetId);
        const row = result.profile;
        profile = {
          ...(profile || UserStore.initializeNewUser(targetId, row.phone || '', row.full_name || 'Athlete')),
          id: String(row.id), phone: row.phone || '', fullName: row.full_name || profile?.fullName || 'Athlete',
          avatarUrl: row.avatar_url || undefined, dateOfBirth: row.date_of_birth || undefined,
          gender: row.gender || undefined, country: row.country || 'United States',
          preferredUnits: row.preferred_units || 'metric', isOnboarded: Boolean(row.is_onboarded),
          streakCount: Number(row.streak_count || 0), totalPoints: Number(row.total_trophy_points || 0),
          createdAt: row.created_at || profile?.createdAt || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
        };
        UserStore.saveProfile(profile);
      } catch { /* Keep the cached profile available while the backend is offline. */ }
    }

    if (!profile) {
      profile = UserStore.initializeNewUser(targetId, '', 'Athlete');
    }

    return profile;
  },

  /**
   * Save or update user profile.
   */
  async saveUserProfile(profileData: Partial<UserProfile>): Promise<UserProfile> {
    const targetId = profileData.id || currentActiveUserId || 'usr_guest';
    const existing = await this.getUserProfile(targetId);

    const updated: UserProfile = {
      ...existing,
      ...profileData,
      updatedAt: new Date().toISOString(),
    };

    if (BackendApi.hasAuthToken()) {
      await BackendApi.updateProfile({
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl,
        dateOfBirth: updated.dateOfBirth,
        gender: updated.gender,
        country: updated.country,
        preferredUnits: updated.preferredUnits,
      });
    }

    UserStore.saveProfile(updated);
    return updated;
  },

  /**
   * Sign out the user, clearing session.
   */
  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignore
    }
    currentActiveUserId = null;
    await BackendApi.signOut();
  },
};
