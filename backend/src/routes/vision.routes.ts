import { FastifyInstance } from 'fastify';
import { VisionService } from '../services/vision.service.js';
import { authenticatedUserId, requireAuth } from './auth-guard.js';

interface ScanFoodBody {
  imageBase64: string;
  mimeType?: string;
}

export async function visionRoutes(fastify: FastifyInstance) {
  // Analyze meal photo with Gemini 1.5/2.0 Flash
  fastify.post<{ Body: ScanFoodBody }>('/scan-food', { preHandler: requireAuth }, async (request, reply) => {
    const { imageBase64, mimeType } = request.body || {};

    if (!imageBase64) {
      return reply.status(400).send({
        error: 'Missing imageBase64 field in request body',
      });
    }
    if (imageBase64.length > 10 * 1024 * 1024 || !/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, ''))) {
      return reply.status(400).send({ error: 'imageBase64 must be a valid base64 image under 10 MB.' });
    }
    if (mimeType && !['image/jpeg','image/png','image/webp'].includes(mimeType)) return reply.status(400).send({ error: 'mimeType must be image/jpeg, image/png, or image/webp.' });

    try {
      const result = await VisionService.analyzeFoodImage(imageBase64, mimeType, authenticatedUserId(request));
      return reply.send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({
        error: err.message || 'Failed to analyze food image with Vision AI',
      });
    }
  });
}
