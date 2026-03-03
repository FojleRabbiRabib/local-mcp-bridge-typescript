import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('localhost'),
  ALLOWED_COMMANDS: z
    .string()
    .default('php,python,python3,node,npx,uvx,deno')
    .transform((str) => str.split(',')),
  CORS_ORIGIN: z.string().default('*'),
  SESSION_TIMEOUT: z.string().default('3600000').transform(Number),
  MAX_SESSIONS: z.string().default('100').transform(Number),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_MAX_SIZE: z.string().default('10485760').transform(Number),
  LOG_FILE_MAX_FILES: z.string().default('5').transform(Number),
  METRICS_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  HEALTH_CHECK_INTERVAL: z.string().default('30000').transform(Number),
  HEALTH_CHECK_TIMEOUT: z.string().default('5000').transform(Number),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  RETRY_MAX_ATTEMPTS: z.string().default('3').transform(Number),
  RETRY_BASE_DELAY: z.string().default('100').transform(Number),
});

export type EnvConfig = z.infer<typeof envSchema>;
