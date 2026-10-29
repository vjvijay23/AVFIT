import { pool } from '../db/index.js';
import { config } from '../config/index.js';

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
   * Verify the MSG91 widget access token, then return or create user profile.
   */
  static async verifyOtp(
    phone: string,
    profile: { fullName?: string; dateOfBirth?: string; gender?: string; avatarUrl?: string; country?: string } = {},
    authMode: 'login' | 'signup' = 'signup',
    providerAccessToken: string
  ): Promise<UserProfileData> {
    const cleanPhone = normalizePhone(phone);
    if (typeof providerAccessToken !== 'string' || providerAccessToken.length < 20 || providerAccessToken.length > 5000) {
      throw new Error('MSG91 access token is required. Verify the code in the app and try again.');
    }
    const identifier = await msg91VerifyAccessToken(providerAccessToken);
    const verifiedPhone = normalizePhone(identifier.startsWith('+') ? identifier : `+${identifier}`);
    if (verifiedPhone !== cleanPhone) {
      throw new Error('The phone number verified by MSG91 does not match the number entered. Edit the number and request a new OTP.');
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

async function msg91VerifyAccessToken(accessToken: string): Promise<string> {
  const { msg91AuthKey } = config;
  if (!msg91AuthKey) {
    throw new Error('MSG91 verification is not configured. Set MSG91_AUTHKEY in the backend environment (Render Environment for the live app; backend/.env for local development).');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let response: Response;
    try {
      response = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ authkey: msg91AuthKey, 'access-token': accessToken }),
        signal: controller.signal,
      });
    } catch (cause) {
      // Only transport errors and timeouts should be reported as unreachable.
      // Keep MSG91's HTTP/body validation errors below so the route can return
      // the correct invalid-code or configuration response to the app.
      const error = new Error('Could not reach MSG91 verification. Please try again shortly.');
      const causeCode = (cause as { cause?: { code?: unknown } })?.cause?.code;
      if (typeof causeCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(causeCode)) {
        Object.assign(error, { providerDiagnosticCode: causeCode });
      }
      throw error;
    }
    const result = await response.json().catch(() => ({})) as { type?: string; message?: string; code?: string | number };
    // MSG91 can return HTTP 200 with an error payload, so check the body too.
    if (!response.ok || result.type !== 'success' || typeof result.message !== 'string') {
      // MSG91 Authkeys can restrict requests by source IP. Render's outbound
      // address must be allowed by the Authkey when this security option is on.
      // Do this before the generic type:error mapping so an infrastructure
      // restriction is never presented to the user as a mistyped OTP.
      if (String(result.code) === '418') {
        const error = new Error('MSG91 blocked verification because the Render server IP is not allowed for this Authkey. Check the Authkey IP security settings and allow Render’s outbound IP.');
        Object.assign(error, { providerDiagnosticCode: '418' });
        throw error;
      }
      if (response.status === 401 || String(result.code) === '201') {
        throw new Error('MSG91 authentication failed. Check the account Authkey and its IP allowlist in the backend environment.');
      }
      if (result.type === 'error') {
        throw new Error('Invalid or expired verification code. Request a new code and try again.');
      }
      throw new Error('MSG91 could not validate this verification. Check the widget and account configuration, then try again.');
    }
    return result.message;
  } finally {
    clearTimeout(timeout);
  }
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
