import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { config } from '../config/index.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const redis = new Redis(config.redisUrl, {
  // The mock API suite stubs Redis commands and should not open a socket.
  lazyConnect: config.nodeEnv === 'test',
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
});

redis.on('error', (err: Error) => {
  console.warn('[Redis] Connection warning:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

pool.on('error', (err: Error) => {
  console.error('[PostgreSQL] Unexpected client error', err);
});
