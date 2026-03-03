import { envSchema, EnvConfig } from '../types/environment.js';
import dotenv from 'dotenv';

dotenv.config();

export function validateEnv(): EnvConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      console.error('❌ Environment validation failed:');
      (error as { issues: Array<{ path: string[]; message: string }> }).issues.forEach((issue) => {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
      });
      console.error('\n💡 Please check your .env file or environment variables.');
    }
    process.exit(1);
  }
}

export const env = validateEnv();
