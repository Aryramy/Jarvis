import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadVoiceConfig,
  saveVoiceConfig,
  resetVoiceConfig,
  getVoiceForLanguage,
  DEFAULT_VOICE_CONFIG,
  TTSProviderManager,
  MockTTSProvider,
} from '../../src/index.js';

describe('Phase 14: Persistent Voice Mapping Configuration (TASK-1401)', () => {
  let tempConfigPath: string;

  beforeEach(() => {
    tempConfigPath = path.join(os.tmpdir(), `jarvis_voice_cfg_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`);
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(tempConfigPath)) {
        await fs.promises.unlink(tempConfigPath);
      }
    } catch {}
  });

  it('should return system default voice configuration when file does not exist', async () => {
    const config = await loadVoiceConfig(tempConfigPath);
    expect(config.en).toBe(DEFAULT_VOICE_CONFIG.en);
    expect(config.ur).toBe(DEFAULT_VOICE_CONFIG.ur);
    expect(config.ar).toBe(DEFAULT_VOICE_CONFIG.ar);
    expect(config.mixed).toBe(DEFAULT_VOICE_CONFIG.mixed);
  });

  it('should atomically save voice configuration to disk and reload it', async () => {
    const saved = await saveVoiceConfig(
      {
        en: 'en-US-JennyNeural',
        ur: 'ur-PK-UzmaNeural',
      },
      tempConfigPath
    );

    expect(saved.en).toBe('en-US-JennyNeural');
    expect(saved.ur).toBe('ur-PK-UzmaNeural');
    expect(saved.ar).toBe(DEFAULT_VOICE_CONFIG.ar); // preserved
    expect(fs.existsSync(tempConfigPath)).toBe(true);

    const reloaded = await loadVoiceConfig(tempConfigPath);
    expect(reloaded.en).toBe('en-US-JennyNeural');
    expect(reloaded.ur).toBe('ur-PK-UzmaNeural');
    expect(reloaded.ar).toBe(DEFAULT_VOICE_CONFIG.ar);
    expect(reloaded.updatedAt).toBeDefined();
  });

  it('should gracefully handle malformed JSON and fall back to defaults', async () => {
    await fs.promises.writeFile(tempConfigPath, 'MALFORMED_JSON_CONTENT{{{', 'utf-8');
    const config = await loadVoiceConfig(tempConfigPath);
    expect(config.en).toBe(DEFAULT_VOICE_CONFIG.en);
    expect(config.ur).toBe(DEFAULT_VOICE_CONFIG.ur);
  });

  it('should reset custom voice mapping back to standard defaults', async () => {
    await saveVoiceConfig({ en: 'custom-voice-id' }, tempConfigPath);
    const beforeReset = await loadVoiceConfig(tempConfigPath);
    expect(beforeReset.en).toBe('custom-voice-id');

    const afterReset = await resetVoiceConfig(tempConfigPath);
    expect(afterReset.en).toBe(DEFAULT_VOICE_CONFIG.en);

    const reloaded = await loadVoiceConfig(tempConfigPath);
    expect(reloaded.en).toBe(DEFAULT_VOICE_CONFIG.en);
  });

  it('should correctly route voice IDs by language code', () => {
    const config = {
      ...DEFAULT_VOICE_CONFIG,
      en: 'voice-en-custom',
      ur: 'voice-ur-custom',
      ar: 'voice-ar-custom',
      mixed: 'voice-mixed-custom',
    };

    expect(getVoiceForLanguage(config, 'en')).toBe('voice-en-custom');
    expect(getVoiceForLanguage(config, 'ur')).toBe('voice-ur-custom');
    expect(getVoiceForLanguage(config, 'ar')).toBe('voice-ar-custom');
    expect(getVoiceForLanguage(config, 'mixed')).toBe('voice-mixed-custom');
  });

  it('should synchronize TTSProviderManager preferred voices from disk config', async () => {
    await saveVoiceConfig({ en: 'en-US-JennyNeural' }, tempConfigPath);

    const manager = new TTSProviderManager({
      providers: [new MockTTSProvider()],
    });

    await manager.syncVoiceConfig(tempConfigPath);
    expect(manager.getPreferredVoice('en')).toBe('en-US-JennyNeural');
  });
});
