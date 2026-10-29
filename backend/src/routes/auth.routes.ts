import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';
import { pool } from '../db/index.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Verify the MSG91 widget access token and return profile + JWT.
  fastify.post<{ Body: { phone: string; accessToken?: string; authMode?: 'login' | 'signup'; profile?: { fullName?: string; dateOfBirth?: string; gender?: string; avatarUrl?: string; country?: string } } }>(
    '/otp/verify',
    async (request, reply) => {
      const { phone, accessToken, profile, authMode } = request.body || {};
      try {
        const user = await AuthService.verifyOtp(phone, profile, authMode, accessToken || '');
        const token = fastify.jwt.sign({ id: user.id, phone: user.phone }, { expiresIn: '7d' });
        return reply.send({
          success: true,
          token,
          user,
        });
      } catch (err: any) {
        const message = err.message || '';
        const unavailable = /MSG91 (verification is not configured|authentication failed|could not validate)|Could not reach MSG91/i.test(message);
        const status = unavailable ? 503 : /Invalid or expired|MSG91 rejected the verification token|MSG91 access token is required|phone number verified by MSG91 does not match/i.test(message) ? 401 : 400;
        const providerDiagnosticCode = typeof err.providerDiagnosticCode === 'string' ? err.providerDiagnosticCode : undefined;
        return reply.status(status).send({ error: message, ...(providerDiagnosticCode ? { providerDiagnosticCode } : {}) });
      }
    }
  );

  // MSG91's optional existence-validation hook. The widget is shared by signup
  // and login, so return a privacy-preserving positive response for any
  // syntactically plausible phone. AVFIT enforces login/signup rules after OTP.
  fastify.get<{ Querystring: { identifier?: string } }>('/otp/user-exists', async (request, reply) => {
    const identifier = typeof request.query.identifier === 'string' ? request.query.identifier.trim() : '';
    const digits = identifier.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      return reply.status(400).send({ user_found: false, identifier });
    }
    return { user_found: true, identifier };
  });

  // Fetch profile
  fastify.get<{ Params: { id: string } }>('/profile/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params;
    if (id !== authenticatedUserId(request)) return reply.status(403).send({ error: 'You may only access your own profile.' });
    try {
      const profile = await AuthService.getProfile(id);
      if (!profile) {
        return reply.status(404).send({ error: 'User profile not found' });
      }
      return reply.send({ success: true, profile });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.patch<{ Body: { fullName?: string; avatarUrl?: string | null; dateOfBirth?: string | null; gender?: string; country?: string; preferredUnits?: string } }>('/profile', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body || {};
    const fields: Array<[string, unknown]> = [];
    if (body.fullName !== undefined) {
      const name = body.fullName.trim();
      if (name.length > 100) return reply.status(400).send({ error: 'fullName must be at most 100 characters.' });
      fields.push(['full_name', name]);
    }
    if (body.avatarUrl !== undefined) fields.push(['avatar_url', body.avatarUrl]);
    if (body.dateOfBirth !== undefined) fields.push(['date_of_birth', body.dateOfBirth]);
    if (body.gender !== undefined) {
      if (!['male','female','non_binary','prefer_not_to_say'].includes(body.gender)) return reply.status(400).send({ error: 'Invalid gender.' });
      fields.push(['gender', body.gender]);
    }
    if (body.country !== undefined) fields.push(['country', body.country]);
    if (body.preferredUnits !== undefined) {
      if (!['metric','imperial'].includes(body.preferredUnits)) return reply.status(400).send({ error: 'preferredUnits must be metric or imperial.' });
      fields.push(['preferred_units', body.preferredUnits]);
    }
    if (!fields.length) return reply.status(400).send({ error: 'Provide at least one profile field.' });
    const userId = authenticatedUserId(request);
    const result = await pool.query(
      `UPDATE profiles SET ${fields.map(([column],i)=>`${column}=$${i+1}`).join(',')},updated_at=NOW() WHERE id=$${fields.length+1} RETURNING id,phone,full_name,avatar_url,date_of_birth,gender,country,preferred_units,streak_count,total_trophy_points,is_onboarded,created_at,updated_at`,
      [...fields.map(([,value])=>value), userId]
    );
    if (!result.rows[0]) return reply.status(404).send({ error: 'Profile not found.' });
    return { success: true, profile: result.rows[0] };
  });
}
