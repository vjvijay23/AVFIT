import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgrespassword@localhost:5433/avfit_db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-change-me'),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID || '',
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET || '',
  twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
  otpProvider: process.env.OTP_PROVIDER || 'twilio',
};

if (!['twilio', 'mock'].includes(config.otpProvider)) {
  throw new Error('OTP_PROVIDER must be either "twilio" or "mock".');
}

if (config.nodeEnv === 'production' && config.otpProvider === 'mock') {
  throw new Error('OTP_PROVIDER=mock is only allowed outside production.');
}

if (config.nodeEnv === 'production' && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}
