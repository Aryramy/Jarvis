import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, maskSecret, resetConfigCache } from '../../src/config/index.js';

describe('Configuration & Environment Manager', () => {
  beforeEach(() => {
    resetConfigCache();
  });

  it('should successfully load valid environment configuration', () => {
    const mockEnv = {
      CHEAPERINFERENCE_API_KEY: 'ci_live_test_key_1234567890',
      CHEAPERINFERENCE_BASE_URL: 'https://api.cheaperinference.com/v1',
      NODE_ENV: 'test',
    };

    const config = loadConfig(mockEnv);
    expect(config.CHEAPERINFERENCE_API_KEY).toBe('ci_live_test_key_1234567890');
    expect(config.CHEAPERINFERENCE_BASE_URL).toBe('https://api.cheaperinference.com/v1');
    expect(config.CHEAPERINFERENCE_MODEL).toBe('deepseek-v4-flash');
    expect(config.DEFAULT_LANGUAGE).toBe('en');
    expect(config.HEADLESS_BROWSER).toBe(false);
  });

  it('should throw descriptive error when required API key is missing', () => {
    const invalidEnv = {
      CHEAPERINFERENCE_API_KEY: '',
    };

    expect(() => loadConfig(invalidEnv)).toThrowError(/CHEAPERINFERENCE_API_KEY is required/);
  });

  it('should safely mask API secrets', () => {
    expect(maskSecret('ci_live_9231656965d4c7cdaad73af5d9ef493162f8acc1ced6f567')).toBe('ci_l...f567');
    expect(maskSecret('short')).toBe('***');
  });

  it('should load actual configuration from .env file', () => {
    const config = loadConfig();
    expect(config.CHEAPERINFERENCE_API_KEY).toBeDefined();
    expect(config.CHEAPERINFERENCE_API_KEY.startsWith('ci_live_')).toBe(true);
    expect(config.CHEAPERINFERENCE_BASE_URL).toBe('https://api.cheaperinference.com/v1');
  });
});
