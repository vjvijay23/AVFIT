import { FastifyInstance } from 'fastify';
import { performance } from 'node:perf_hooks';
import { VisionService, VisionServiceError, type VisionScanMetrics } from '../services/vision.service.js';
import { requireAuth } from './auth-guard.js';

interface ScanFoodBody {
  imageBase64: string;
  mimeType?: string;
}

export async function visionRoutes(fastify: FastifyInstance) {
  // Analyze meal photos with the configured Gemini model.
  fastify.post<{ Body: ScanFoodBody }>('/scan-food', { preHandler: requireAuth }, async (request, reply) => {
    const requestStarted = performance.now();
    let metrics: VisionScanMetrics | undefined;
    let inputValidationMs: number | undefined;
    const sendTimings = (source = metrics?.source || 'rejected') => {
      const validationMs = inputValidationMs ?? (performance.now() - requestStarted);
      const entries = [
        `image-validation;dur=${validationMs.toFixed(1)}`,
        ...(metrics ? [
          `redis;dur=${metrics.redisLookupMs.toFixed(1)}`,
          `deduplication;dur=${metrics.deduplicationWaitMs.toFixed(1)}`,
          `gemini;dur=${metrics.geminiMs.toFixed(1)}`,
          `response-validation;dur=${metrics.responseValidationMs.toFixed(1)}`,
        ] : []),
        `server-total;dur=${(performance.now() - requestStarted).toFixed(1)};desc="${source}"`,
      ];
      reply.header('Server-Timing', entries.join(', '));
    };
    const { imageBase64, mimeType } = request.body || {};

    if (typeof imageBase64 !== 'string' || !imageBase64) {
      sendTimings();
      return reply.status(400).send({
        error: 'Missing imageBase64 field in request body',
      });
    }
    if (imageBase64.length > 10 * 1024 * 1024 || !/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, ''))) {
      sendTimings();
      return reply.status(400).send({ error: 'imageBase64 must be a valid base64 image under 10 MB.' });
    }
    if (mimeType && !['image/jpeg','image/png','image/webp'].includes(mimeType.toLowerCase())) {
      sendTimings();
      return reply.status(400).send({ error: 'mimeType must be image/jpeg, image/png, or image/webp.' });
    }
    inputValidationMs = performance.now() - requestStarted;

    try {
      const result = await VisionService.analyzeFoodImage(imageBase64, mimeType?.toLowerCase(), (value) => { metrics = value; });
      sendTimings();
      request.log.info({
        scanSource: metrics?.source,
        cacheHit: metrics?.source === 'cache_hit' || metrics?.source === 'redis_lock_deduplicated',
        imageValidationMs: inputValidationMs,
        redisLookupMs: metrics?.redisLookupMs,
        deduplicationWaitMs: metrics?.deduplicationWaitMs,
        primaryModelMs: metrics?.primaryModelMs,
        fallbackModelMs: metrics?.fallbackModelMs,
        responseValidationMs: metrics?.responseValidationMs,
        serverTotalMs: performance.now() - requestStarted,
      }, 'Food scan timings');
      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      // Keep provider status/details in Render logs so upstream failures can be
      // fixed without logging the user's image, authorization header, or API key.
      request.log.error({
        errorName: err?.name,
        statusCode: err?.statusCode,
        providerStatus: err?.providerDiagnostic?.status,
        providerCode: err?.providerDiagnostic?.code,
        providerMessage: err?.providerDiagnostic?.message,
        providerModel: err?.providerDiagnostic?.model,
      }, 'Food image analysis failed');
      sendTimings();
      if (metrics) request.log.info({
        scanSource: metrics.source,
        redisLookupMs: metrics.redisLookupMs,
        deduplicationWaitMs: metrics.deduplicationWaitMs,
        primaryModelMs: metrics.primaryModelMs,
        fallbackModelMs: metrics.fallbackModelMs,
        responseValidationMs: metrics.responseValidationMs,
        serverTotalMs: performance.now() - requestStarted,
      }, 'Food scan failure timings');
      const statusCode = (err as Error & { statusCode?: number }).statusCode || 502;
      return reply.status(statusCode).send({
        error: err instanceof VisionServiceError
          ? err.message
          : statusCode === 503 ? err.message : 'Food photo analysis failed. Please try again shortly.',
      });
    }
  });
}
