import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgrespassword@localhost:5433/avfit_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Gemini credentials belong only on the server; never read the Expo public env.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-change-me'),
  msg91AuthKey: process.env.MSG91_AUTHKEY || '',
};

if (config.nodeEnv === 'production' && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}
if (config.nodeEnv === 'production' && !config.msg91AuthKey) {
  throw new Error('MSG91_AUTHKEY must be configured in production.');
}
