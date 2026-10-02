import { describe, it, expect } from 'vitest';
import { JARVIS_VERSION, getSystemInfo } from '../../src/index.js';

describe('JARVIS System Smoke Test', () => {
  it('should return correct initial version and status', () => {
    const info = getSystemInfo();
    expect(info.version).toBe(JARVIS_VERSION);
    expect(info.status).toBe('INITIALIZING');
  });
});
