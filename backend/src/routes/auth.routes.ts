import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';
import { pool } from '../db/index.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { phone: string; pin: string } }>('/pin/login', {
    schema: {
      tags: ['auth'],
      summary: 'Sign in with a verified phone number and four-digit PIN',
      body: { type: 'object', required: ['phone', 'pin'], properties: { phone: { type: 'string', description: 'E.164 phone number, e.g. +919876543210' }, pin: { type: 'string', pattern: '^\\d{4}$' } } },
      response: { 200: { type: 'object', required: ['success', 'token', 'user'], properties: { success: { type: 'boolean' }, token: { type: 'string' }, user: { type: 'object', additionalProperties: true } } } },
    },
  }, async (request, reply) => {
    try {
      const user = await AuthService.loginWithPin(request.body?.phone || '', request.body?.pin || '');
      const token = fastify.jwt.sign({ id: user.id, phone: user.phone }, { expiresIn: '7d' });
      return reply.send({ success: true, token, user });
    } catch (err: any) {
      const status = Number.isInteger(err?.statusCode) ? err.statusCode : /international format|valid phone/i.test(err?.message || '') ? 400 : 503;
      return reply.status(status).send({ error: err?.message || 'PIN sign-in failed.' });
    }
  });

  fastify.post<{ Body: { pin: string; confirmation: string } }>('/pin/set', {
    preHandler: requireAuth,
    schema: {
      tags: ['auth'],
      summary: 'Create or reset the authenticated account PIN after OTP verification',
      security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['pin', 'confirmation'], properties: { pin: { type: 'string', pattern: '^\\d{4}$' }, confirmation: { type: 'string', pattern: '^\\d{4}$' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' }, user: { type: 'object', additionalProperties: true } } } },
    },
  }, async (request, reply) => {
    try {
      await AuthService.setPin(authenticatedUserId(request), request.body?.pin || '', request.body?.confirmation || '');
      const user = await AuthService.getProfile(authenticatedUserId(request));
      return reply.send({ success: true, user });
    } catch (err: any) {
      const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
      return reply.status(status).send({ error: err?.message || 'Could not save your PIN.' });
    }
  });

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
        const unavailable = /MSG91 (verification is not configured|authentication failed|could not validate|blocked verification)/i.test(message) || /Could not reach MSG91/i.test(message);
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

  fastify.get<{ Params: { id: string } }>('/profile/:id/avatar', { preHandler: requireAuth }, async (request, reply) => {
    const userId = authenticatedUserId(request);
    if (request.params.id !== userId) return reply.status(403).send({ error: 'You may only access your own profile photo.' });
    const result = await pool.query('SELECT image_data, mime_type FROM profile_photos WHERE user_id=$1', [userId]);
    if (!result.rows[0]) return reply.status(404).send({ error: 'No profile photo has been uploaded.' });
    return reply
      .type(result.rows[0].mime_type)
      .header('Cache-Control', 'private, max-age=300')
      .send(result.rows[0].image_data);
  });

  fastify.put<{ Body: { imageBase64: string; mimeType: string } }>('/profile/avatar', { preHandler: requireAuth }, async (request, reply) => {
    const { imageBase64, mimeType } = request.body || {};
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return reply.status(400).send({ error: 'Choose a JPEG, PNG, or WebP profile photo.' });
    }
    if (typeof imageBase64 !== 'string' || imageBase64.length > 1_500_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(imageBase64)) {
      return reply.status(400).send({ error: 'Profile photos must be valid images smaller than 1 MB.' });
    }
    const image = Buffer.from(imageBase64, 'base64');
    if (!image.length || image.length > 1_000_000 || !isImageMime(image, mimeType)) {
      return reply.status(400).send({ error: 'Profile photos must be valid images smaller than 1 MB.' });
    }
    const userId = authenticatedUserId(request);
    const result = await pool.query(
      `INSERT INTO profile_photos (user_id, image_data, mime_type, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id) DO UPDATE SET image_data=EXCLUDED.image_data, mime_type=EXCLUDED.mime_type, updated_at=NOW()
       RETURNING updated_at`,
      [userId, image, mimeType]
    );
    return reply.send({ success: true, updatedAt: new Date(result.rows[0].updated_at).toISOString() });
  });

  fastify.delete('/profile/avatar', { preHandler: requireAuth }, async (request, reply) => {
    await pool.query('DELETE FROM profile_photos WHERE user_id=$1', [authenticatedUserId(request)]);
    return reply.send({ success: true });
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

function isImageMime(image: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return image.length > 3 && image[0] === 0xff && image[1] === 0xd8 && image[image.length - 2] === 0xff && image[image.length - 1] === 0xd9;
  if (mimeType === 'image/png') return image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/webp') return image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
