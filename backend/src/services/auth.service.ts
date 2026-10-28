import { pool } from '../db/index.js';
import { config } from '../config/index.js';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

const MOCK_OTP_TTL_MS = 5 * 60 * 1000;
const MOCK_OTP_RESEND_DELAY_MS = 60 * 1000;
const MOCK_OTP_MAX_ATTEMPTS = 5;
const mockOtpChallenges = new Map<string, { codeHash: Buffer; expiresAt: number; resendAfter: number; attempts: number }>();

export interface UserProfileData {
  id: string;
  phone: string;
  fullName: string;
  avatarUrl?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  country?: string | null;
  preferredUnits?: string | null;
  streakCount: number;
  isOnboarded: boolean;
  isNewUser: boolean;
}

export class AuthService {
  /**
   * Start SMS verification through Twilio, or an explicitly enabled local
   * development mock. The mock code is ephemeral, expires after five minutes,
   * and is returned only while OTP_PROVIDER=mock outside production.
   */
  static async requestOtp(phone: string) {
    const cleanPhone = normalizePhone(phone);
    if (config.otpProvider === 'mock') {
      const existing = mockOtpChallenges.get(cleanPhone);
      if (existing && existing.resendAfter > Date.now()) {
        throw new Error('Please wait before requesting another development code.');
      }
      const code = String(randomInt(100000, 1000000));
      mockOtpChallenges.set(cleanPhone, {
        codeHash: hashMockOtp(code),
        expiresAt: Date.now() + MOCK_OTP_TTL_MS,
        resendAfter: Date.now() + MOCK_OTP_RESEND_DELAY_MS,
        attempts: 0,
      });
      return {
        success: true,
        message: 'Development mock mode is enabled. No SMS was sent.',
        phone: cleanPhone,
        isMockOtp: true,
        developmentOtp: code,
      };
    }

    const result = await twilioVerify('Verifications', { To: cleanPhone, Channel: 'sms' });
    if (result.status !== 'pending') throw new Error('The SMS verification could not be started. Please try again.');
    return {
      success: true,
      message: 'Verification code sent by SMS.',
      phone: cleanPhone,
      isMockOtp: false,
    };
  }

  /**
   * Verify OTP and return or create user profile
   */
  static async verifyOtp(
    phone: string,
    otp: string,
    profile: { fullName?: string; dateOfBirth?: string; gender?: string; avatarUrl?: string; country?: string } = {},
    authMode: 'login' | 'signup' = 'signup'
  ): Promise<UserProfileData> {
    const cleanPhone = normalizePhone(phone);
    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw new Error('Enter the 6-digit verification code sent to your phone.');
    if (config.otpProvider === 'mock') {
      const challenge = mockOtpChallenges.get(cleanPhone);
      if (!challenge || challenge.expiresAt <= Date.now()) {
        mockOtpChallenges.delete(cleanPhone);
        throw new Error('Development code expired. Request a new code and try again.');
      }
      challenge.attempts += 1;
      const candidateHash = hashMockOtp(otp);
      if (challenge.attempts > MOCK_OTP_MAX_ATTEMPTS || !timingSafeEqual(challenge.codeHash, candidateHash)) {
        if (challenge.attempts >= MOCK_OTP_MAX_ATTEMPTS) mockOtpChallenges.delete(cleanPhone);
        throw new Error('Invalid or expired verification code. Request a new code and try again.');
      }
      mockOtpChallenges.delete(cleanPhone);
    } else {
      const verification = await twilioVerify('VerificationCheck', { To: cleanPhone, Code: otp });
      if (verification.status !== 'approved') throw new Error('Invalid or expired verification code. Request a new code and try again.');
    }

    // Check if user exists
    const existing = await pool.query(`SELECT * FROM profiles WHERE phone = $1`, [cleanPhone]);

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      return {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        dateOfBirth: user.date_of_birth,
        gender: user.gender,
        country: user.country,
        preferredUnits: user.preferred_units,
        streakCount: user.streak_count || 0,
        isOnboarded: Boolean(user.is_onboarded),
        isNewUser: false,
      };
    }

    if (authMode === 'login') {
      throw new Error('No account is registered with this phone number. Create an account first.');
    }

    const fullName = profile.fullName?.trim();
    if (!fullName || fullName.length > 100) throw new Error('Enter a valid full name to create your account.');
    const birthDate = profile.dateOfBirth ? new Date(`${profile.dateOfBirth}T00:00:00Z`) : null;
    const age = birthDate && !Number.isNaN(birthDate.getTime())
      ? Math.floor((Date.now() - birthDate.getTime()) / 31557600000)
      : 0;
    if (!profile.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth) || !birthDate || Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== profile.dateOfBirth || age < 13 || age > 100) {
      throw new Error('Enter a valid date of birth to create your account.');
    }
    if (!['male', 'female', 'non_binary', 'prefer_not_to_say'].includes(profile.gender || '')) {
      throw new Error('Select a valid gender to create your account.');
    }

    // Create new profile
    const insertQuery = `
      INSERT INTO profiles (phone, full_name, date_of_birth, gender, avatar_url, country, streak_count)
      VALUES ($1, $2, $3, $4, $5, $6, 0)
      RETURNING *;
    `;
    const newProfile = await pool.query(insertQuery, [
      cleanPhone,
      fullName,
      profile.dateOfBirth,
      profile.gender,
      profile.avatarUrl || null,
      profile.country || 'US',
    ]);

    const user = newProfile.rows[0];
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      dateOfBirth: user.date_of_birth,
      gender: user.gender,
      country: user.country,
      preferredUnits: user.preferred_units,
      streakCount: user.streak_count,
      isOnboarded: Boolean(user.is_onboarded),
      isNewUser: true,
    };
  }

  static async getProfile(userId: string): Promise<UserProfileData | null> {
    const res = await pool.query(`SELECT * FROM profiles WHERE id = $1`, [userId]);
    if (res.rows.length === 0) return null;
    const user = res.rows[0];
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      dateOfBirth: user.date_of_birth,
      gender: user.gender,
      country: user.country,
      preferredUnits: user.preferred_units,
      streakCount: user.streak_count || 0,
      isOnboarded: Boolean(user.is_onboarded),
      isNewUser: false,
    };
  }
}

function hashMockOtp(code: string): Buffer {
  return createHash('sha256').update(code).digest();
}

function normalizePhone(phone: string): string {
  if (typeof phone !== 'string') throw new Error('Please provide a valid phone number in international format.');
  if (!phone.trim().startsWith('+')) throw new Error('Include the country code, for example +919876543210.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    throw new Error('Please provide a valid phone number in international format, including its country code.');
  }
  return `+${digits}`;
}

async function twilioVerify(resource: 'Verifications' | 'VerificationCheck', fields: Record<string, string>) {
  const { twilioAccountSid, twilioAuthToken, twilioApiKeySid, twilioApiKeySecret, twilioVerifyServiceSid } = config;
  const hasApiKeySettings = Boolean(twilioApiKeySid || twilioApiKeySecret);
  const hasApiKeyPair = Boolean(twilioApiKeySid && twilioApiKeySecret);
  const hasAccountCredentials = Boolean(twilioAccountSid && twilioAuthToken);
  if (!twilioVerifyServiceSid || (hasApiKeySettings ? !hasApiKeyPair : !hasAccountCredentials)) {
    throw new Error('SMS verification is not configured. Set TWILIO_VERIFY_SERVICE_SID and either TWILIO_API_KEY_SID plus TWILIO_API_KEY_SECRET, or TWILIO_ACCOUNT_SID plus TWILIO_AUTH_TOKEN in backend/.env.');
  }

  const endpoint = `https://verify.twilio.com/v2/Services/${encodeURIComponent(twilioVerifyServiceSid)}/${resource}`;
  const username = hasApiKeyPair ? twilioApiKeySid : twilioAccountSid;
  const password = hasApiKeyPair ? twilioApiKeySecret : twilioAuthToken;
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({})) as { status?: string; code?: number; message?: string };
    if (resource === 'VerificationCheck' && response.status === 404) return { status: 'expired' };
    if (!response.ok) {
      if (response.status === 401 || result.code === 20003 || result.code === 8001) {
        throw new Error(`Twilio authentication failed (code ${result.code ?? response.status}). Check that the API key SID and secret belong to this Twilio account and US1 region.`);
      }
      if (result.code === 21608) {
        throw new Error('Twilio trial accounts can send verification SMS only to phone numbers verified in Twilio Console. Verify this recipient or use OTP_PROVIDER=mock for local development.');
      }
      throw new Error(`SMS verification service rejected the request${result.code ? ` (Twilio code ${result.code})` : ''}. Check the phone number, Verify service, and account status.`);
    }
    return result;
  } catch (error) {
    if (error instanceof Error && /^(SMS verification service rejected|Twilio authentication failed|Twilio trial accounts)/.test(error.message)) throw error;
    throw new Error('Could not reach the SMS verification service. Please try again shortly.');
  } finally {
    clearTimeout(timeout);
  }
}
