import { AuthUser, PhoneAuthRequest, OtpVerifyRequest, UserProfile, Gender } from '../types';
import { UserStore } from './userStore';
import { BackendApi } from './backendApi';
import * as Msg91Otp from './msg91Otp';
import { OTP_CODE_LENGTH } from './otpConfig';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

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
const BIOMETRIC_LOGIN_KEY = 'avfit.biometric-login-enabled';

export const AuthService = {
  async restoreSession(): Promise<boolean> {
    const userId = await BackendApi.restoreAuthSession();
    if (!userId) return false;
    const biometricEnabled = await this.isBiometricLoginEnabled();
    if (biometricEnabled && Platform.OS !== 'web') {
      try {
        const [hardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hardware || !enrolled) {
          await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_KEY);
        } else {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock AVFIT',
            cancelLabel: 'Use PIN',
            disableDeviceFallback: true,
          });
          if (!result.success) {
            BackendApi.clearAuthToken();
            return false;
          }
        }
      } catch {
        BackendApi.clearAuthToken();
        return false;
      }
    }
    currentActiveUserId = userId;
    return true;
  },
  async signInWithPin(phone: string, pin: string): Promise<UserProfile> {
    const result = await BackendApi.loginWithPin(phone, pin);
    currentActiveUserId = String(result.user.id);
    return this.getUserProfile(currentActiveUserId);
  },
  async isBiometricLoginEnabled(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try { return (await SecureStore.getItemAsync(BIOMETRIC_LOGIN_KEY)) === 'true'; }
    catch { return false; }
  },
  async enableBiometricLogin(): Promise<void> {
    if (Platform.OS === 'web') throw new Error('Device biometrics are available in the Android and iOS app only.');
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled) throw new Error('Set up a fingerprint or face unlock in your device settings first.');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm biometrics for AVFIT sign-in',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
    });
    if (!result.success) throw new Error('Biometric confirmation was not completed.');
    await SecureStore.setItemAsync(BIOMETRIC_LOGIN_KEY, 'true');
  },
  async disableBiometricLogin(): Promise<void> {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_KEY);
  },
  async signInWithBiometrics(): Promise<boolean> {
    if (Platform.OS === 'web' || !(await this.isBiometricLoginEnabled())) return false;
    const userId = await BackendApi.restoreAuthSession();
    if (!userId) return false;
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled) { BackendApi.clearAuthToken(); return false; }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock AVFIT',
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
    });
    if (!result.success) {
      BackendApi.clearAuthToken();
      return false;
    }
    currentActiveUserId = userId;
    return true;
  },
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
  ): Promise<{ success: boolean; message: string }> {
    const fullPhone = request.phone.trim();
    if (!fullPhone || fullPhone.length < 8) {
      throw new Error('Please enter a valid mobile phone number with country code.');
    }

    await Msg91Otp.sendOtp(fullPhone);
    return { success: true, message: 'Verification code sent by MSG91.' };
  },

  /**
   * Verify the OTP code for the phone number.
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

    if (cleanToken.length !== OTP_CODE_LENGTH || !/^\d+$/.test(cleanToken)) {
      throw new Error(`Please enter the complete ${OTP_CODE_LENGTH}-digit verification code.`);
    }

    const accessToken = await Msg91Otp.verifyOtp(phone, cleanToken);
    const response = await BackendApi.verifyOtp(phone, accessToken, pendingProfile, authMode);
    const isNewUser = response.user.isNewUser ?? authMode === 'signup';
    const userId = response.user.id;
    currentActiveUserId = userId;
    const existing = UserStore.getProfile(userId);
    const profile = existing || UserStore.initializeNewUser(
      userId,
      response.user.phone,
      response.user.fullName || pendingProfile?.fullName || 'New Athlete',
      response.user.country || pendingProfile?.country || 'United States',
      response.user.avatarUrl || pendingProfile?.avatarUrl || '🏃‍♂️',
      response.user.dateOfBirth || pendingProfile?.dateOfBirth,
      (response.user.gender || pendingProfile?.gender) as Gender | undefined
    );
    const normalizedProfile = await this.saveUserProfile({
      ...profile,
      phone: response.user.phone,
      fullName: response.user.fullName || profile.fullName,
      avatarUrl: response.user.avatarUrl || profile.avatarUrl,
      dateOfBirth: response.user.dateOfBirth || profile.dateOfBirth,
      age: ageFromDateOfBirth(response.user.dateOfBirth || profile.dateOfBirth) || profile.age,
      gender: (response.user.gender || profile.gender) as Gender | undefined,
      country: response.user.country || profile.country,
      preferredUnits: (response.user.preferredUnits || profile.preferredUnits) as UserProfile['preferredUnits'],
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
      hasPin: Boolean(response.user.hasPin),
    };

    return {
      success: true,
      user: authUser,
      isNewUser,
      profile: normalizedProfile,
    };
  },

  async resendPhoneOtp(request: PhoneAuthRequest): Promise<{ success: boolean; message: string }> {
    await Msg91Otp.resendOtp(request.phone);
    return { success: true, message: 'A new verification code was sent by MSG91.' };
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
      throw new Error('Sign in to view your profile.');
    }
    let profile = UserStore.getProfile(targetId);

    if (BackendApi.hasAuthToken() && targetId === currentActiveUserId) {
      const result = await BackendApi.getProfile(targetId);
      const row = result.profile;
      profile = {
        ...(profile || {} as UserProfile),
        id: String(row.id), phone: row.phone || '', fullName: row.fullName || row.full_name || profile?.fullName || '',
        avatarUrl: row.avatarUrl || row.avatar_url || undefined, dateOfBirth: row.dateOfBirth || row.date_of_birth || undefined,
        age: ageFromDateOfBirth(row.dateOfBirth || row.date_of_birth) || profile?.age,
        gender: row.gender || undefined, country: row.country || '',
        preferredUnits: row.preferredUnits || row.preferred_units || 'metric', isOnboarded: Boolean(row.isOnboarded ?? row.is_onboarded),
        streakCount: Number(row.streakCount ?? row.streak_count ?? 0), totalPoints: Number(row.totalPoints ?? row.total_trophy_points ?? 0),
        hasProfilePhoto: Boolean(row.hasProfilePhoto ?? row.has_profile_photo),
        photoUpdatedAt: row.photoUpdatedAt ? new Date(row.photoUpdatedAt).toISOString() : row.photo_updated_at ? new Date(row.photo_updated_at).toISOString() : undefined,
        createdAt: row.createdAt || row.created_at || profile?.createdAt || new Date().toISOString(),
        updatedAt: row.updatedAt || row.updated_at || new Date().toISOString(),
      };
      UserStore.saveProfile(profile);
    }

    if (!profile) {
      throw new Error('Profile was not found in the database. Sign in again or complete account signup.');
    }

    return profile;
  },

  /**
   * Save or update user profile.
   */
  async saveUserProfile(profileData: Partial<UserProfile>): Promise<UserProfile> {
    const targetId = profileData.id || currentActiveUserId;
    if (!targetId) throw new Error('Sign in before saving profile changes.');
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
    currentActiveUserId = null;
    await BackendApi.signOut();
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_KEY).catch(() => undefined);
  },
};

function ageFromDateOfBirth(value?: string | null): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? age : undefined;
}
