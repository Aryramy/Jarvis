import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file into process.env with explicit path resolution
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  CHEAPERINFERENCE_API_KEY: z.string().min(1, 'CHEAPERINFERENCE_API_KEY is required in .env'),
  CHEAPERINFERENCE_BASE_URL: z.string().url().default('https://api.cheaperinference.com/v1'),
  CHEAPERINFERENCE_MODEL: z.string().default('deepseek-v4-flash'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DEFAULT_LANGUAGE: z.enum(['en', 'ur', 'ar']).default('en'),
  HEADLESS_BROWSER: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

/**
 * Validates and returns the strongly-typed application configuration.
 * Caches the parsed configuration for subsequent calls.
 */
export function loadConfig(overrideEnv?: Record<string, string | undefined>): AppConfig {
  if (cachedConfig && !overrideEnv) {
    return cachedConfig;
  }

  const rawEnv = overrideEnv ?? process.env;
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`[Configuration Error] Invalid environment configuration: ${errorDetails}`);
  }

  if (!overrideEnv) {
    cachedConfig = result.data;
  }

  return result.data;
}

/**
 * Safely masks an API key or secret for telemetry/logging purposes.
 */
export function maskSecret(secret: string): string {
  if (!secret || secret.length <= 8) {
    return '***';
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Resets the cached configuration (primarily for testing).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
