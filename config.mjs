import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve current project directory for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

export const config = {
  apiKey: process.env.CHEAPERINFERENCE_API_KEY || '',
  baseUrl: process.env.CHEAPERINFERENCE_BASE_URL || 'https://api.cheaperinference.com/v1',
  catalogTtlMs: parseInt(process.env.MODEL_CATALOG_TTL_MS || '300000', 10), // 5 minutes
  maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '20', 10),
  defaultModel: process.env.CHEAPERINFERENCE_MODEL || 'deepseek-v4-flash',
};

export function validateConfig() {
  if (!config.apiKey || config.apiKey.trim().length === 0) {
    throw new Error('[Configuration] CHEAPERINFERENCE_API_KEY is missing or empty in .env');
  }
  if (!config.baseUrl || !config.baseUrl.startsWith('http')) {
    throw new Error('[Configuration] CHEAPERINFERENCE_BASE_URL is invalid in .env');
  }
  return true;
}

export function maskSecret(secret) {
  if (!secret || secret.length <= 8) return '***';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

export function getSafeStatus() {
  return {
    apiKeyConfigured: Boolean(config.apiKey && config.apiKey.trim().length > 0),
    baseUrl: config.baseUrl,
    catalogTtlMs: config.catalogTtlMs,
    maxContextMessages: config.maxContextMessages,
  };
}
