import Fastify from 'fastify';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/index.js';
import { runMigrations } from './db/migrate.js';
import { activityRoutes } from './routes/activity.routes.js';
import { visionRoutes } from './routes/vision.routes.js';
import { leaderboardRoutes } from './routes/leaderboard.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { fitnessRoutes } from './routes/fitness.routes.js';
import { mealRoutes } from './routes/meal.routes.js';
import { workoutRoutes } from './routes/workout.routes.js';
import { achievementRoutes } from './routes/achievement.routes.js';
import { communityRoutes } from './routes/community.routes.js';
import { pool, redis } from './db/index.js';

export async function buildApp() {
  const fastify = Fastify({
    bodyLimit: 12 * 1024 * 1024,
    logger: {
      level: 'info',
    },
  });

  // 1. CORS plugin for React Native / Expo development
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 2. JWT Plugin
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // 3. Swagger OpenAPI Documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'AVFIT Live Walking & AI Nutrition Backend API',
        description: 'PostgreSQL + PostGIS GPS Tracking, Redis Leaderboards & Gemini Food Vision',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: 'Local Development Server',
        },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // 4. Health Check
  fastify.get('/health', async (_request, reply) => {
    let postgres = false;
    let redisStatus = false;
    try { await pool.query('SELECT 1'); postgres = true; } catch { /* health response reports dependency state */ }
    try { redisStatus = (await redis.ping()) === 'PONG'; } catch { /* health response reports dependency state */ }
    const healthy = postgres && redisStatus;
    if (!healthy) reply.status(503);
    return { status: healthy ? 'healthy' : 'degraded', service: 'avfit-backend', timestamp: new Date().toISOString(), postgres, redis: redisStatus, otpProvider: config.otpProvider };
  });

  // 5. Register Subsystem Routes
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(activityRoutes, { prefix: '/api/v1/activities' });
  await fastify.register(visionRoutes, { prefix: '/api/v1/vision' });
  await fastify.register(leaderboardRoutes, { prefix: '/api/v1/leaderboard' });
  await fastify.register(fitnessRoutes, { prefix: '/api/v1/fitness' });
  await fastify.register(mealRoutes, { prefix: '/api/v1/meals' });
  await fastify.register(workoutRoutes, { prefix: '/api/v1/workouts' });
  await fastify.register(achievementRoutes, { prefix: '/api/v1/achievements' });
  await fastify.register(communityRoutes, { prefix: '/api/v1/community' });

  return fastify;
}

export async function start() {
  try {
    // Automatically apply PostGIS schema migrations
    await runMigrations();

    const app = await buildApp();
    await app.listen({ port: config.port, host: config.host });
    console.log(`\n🚀 AVFIT Fastify Backend running on http://${config.host}:${config.port}`);
    console.log(`🔐 OTP provider: ${config.otpProvider}`);
    console.log(`📚 Interactive API Docs (Swagger): http://localhost:${config.port}/documentation\n`);
    return app;
  } catch (err) {
    console.error('Fatal error during server startup:', err);
    process.exit(1);
  }
}

// Start only when this module is the process entry point. This keeps importing
// buildApp() safe for in-memory API tests.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  start();
}
