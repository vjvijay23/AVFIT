import { FastifyInstance } from 'fastify';
import { StravaService } from '../services/strava.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

const html = (title: string, message: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px system-ui;max-width:520px;margin:15vh auto;padding:24px;color:#183b2b"><h1>${title}</h1><p>${message}</p><p>You can return to AVFIT now.</p></body></html>`;

export async function stravaRoutes(app: FastifyInstance) {
  app.get('/status', { preHandler: requireAuth }, async (request) => ({ success: true, ...await StravaService.status(authenticatedUserId(request)) }));
  app.post('/connect', { preHandler: requireAuth }, async (request, reply) => {
    try { return { success: true, authorizationUrl: await StravaService.authorizationUrl(authenticatedUserId(request)) }; }
    catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message || 'Could not start Strava authorization.' }); }
  });
  app.get<{ Querystring: { code?: string; state?: string; scope?: string; error?: string } }>('/callback', async (request, reply) => {
    if (request.query.error) return reply.type('text/html').send(html('Strava not connected', 'Authorization was cancelled.'));
    if (!request.query.code || !request.query.state) return reply.status(400).type('text/html').send(html('Connection failed', 'Strava did not return an authorization code.'));
    try {
      await StravaService.completeAuthorization(request.query.code, request.query.state, request.query.scope || '');
      return reply.type('text/html').send(html('Strava connected', 'AVFIT can now sync your recent activities. Open AVFIT and tap Sync Strava.'));
    } catch (err: any) {
      request.log.warn({ err: err.message }, 'Strava OAuth callback failed');
      return reply.status(400).type('text/html').send(html('Connection failed', 'Please return to AVFIT, check your Strava app callback setup, and try again.'));
    }
  });
  app.post('/sync', { preHandler: requireAuth }, async (request, reply) => {
    try { return { success: true, ...await StravaService.sync(authenticatedUserId(request)) }; }
    catch (err: any) { request.log.warn({ err: err.message }, 'Strava sync failed'); return reply.status(err.statusCode || 502).send({ error: err.message || 'Could not sync Strava activities.' }); }
  });
  app.get('/activities', { preHandler: requireAuth }, async (request) => ({ success: true, activities: await StravaService.activities(authenticatedUserId(request)) }));
  app.delete('/connection', { preHandler: requireAuth }, async (request, reply) => {
    try { await StravaService.disconnect(authenticatedUserId(request)); return { success: true }; }
    catch (err: any) { return reply.status(err.statusCode || 500).send({ error: err.message || 'Could not disconnect Strava.' }); }
  });
}
