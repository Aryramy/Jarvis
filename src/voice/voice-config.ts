import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { VoiceLanguage } from './types.js';

export interface VoiceMappingConfig {
  en: string;
  ur: string;
  ar: string;
  mixed: string;
  rate?: string; // e.g. "+0%", "-5%"
  pitch?: string; // e.g. "+0Hz"
  volume?: string; // e.g. "+0%"
  providerPreference?: string[];
  updatedAt?: string;
}

export const voiceMappingSchema = z.object({
  en: z.string().min(1, 'English voice identifier is required'),
  ur: z.string().min(1, 'Urdu voice identifier is required'),
  ar: z.string().min(1, 'Arabic voice identifier is required'),
  mixed: z.string().min(1, 'Mixed/code-switching voice identifier is required'),
  rate: z.string().optional(),
  pitch: z.string().optional(),
  volume: z.string().optional(),
  providerPreference: z.array(z.string()).optional(),
  updatedAt: z.string().optional(),
});

export const DEFAULT_VOICE_CONFIG: VoiceMappingConfig = {
  en: 'en-US-ChristopherNeural',
  ur: 'ur-PK-AsadNeural',
  ar: 'ar-SA-HamedNeural',
  mixed: 'en-US-ChristopherNeural',
  rate: '+0%',
  pitch: '+0Hz',
  volume: '+0%',
  providerPreference: ['edge-tts', 'windows-sapi', 'mock-tts'],
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_VOICE_CONFIG_PATH = path.resolve(process.cwd(), 'data', 'voice-config.json');

/**
 * Loads the active voice configuration from disk.
 * If the configuration file does not exist, returns default settings without error.
 */
export async function loadVoiceConfig(customPath?: string): Promise<VoiceMappingConfig> {
  const filePath = customPath ? path.resolve(customPath) : DEFAULT_VOICE_CONFIG_PATH;

  try {
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_VOICE_CONFIG };
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const validated = voiceMappingSchema.parse(parsed);
    return {
      ...DEFAULT_VOICE_CONFIG,
      ...validated,
    };
  } catch (err: any) {
    console.warn(`[VoiceConfig] Failed to load voice config from ${filePath} (${err.message}). Using defaults.`);
    return { ...DEFAULT_VOICE_CONFIG };
  }
}

/**
 * Atomically saves the voice configuration to disk using temporary file replacement.
 */
export async function saveVoiceConfig(
  config: Partial<VoiceMappingConfig>,
  customPath?: string
): Promise<VoiceMappingConfig> {
  const filePath = customPath ? path.resolve(customPath) : DEFAULT_VOICE_CONFIG_PATH;
  const dir = path.dirname(filePath);

  await fs.promises.mkdir(dir, { recursive: true });

  const current = await loadVoiceConfig(customPath);
  const updated: VoiceMappingConfig = {
    ...current,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  const validated = voiceMappingSchema.parse(updated);
  const jsonContent = JSON.stringify(validated, null, 2);

  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  await fs.promises.writeFile(tempPath, jsonContent, 'utf-8');

  try {
    // Atomic rename
    await fs.promises.rename(tempPath, filePath);
  } catch (err: any) {
    // On Windows, if destination exists, rename might fail if locked; try unlink then rename
    if (err.code === 'EEXIST' || err.code === 'EPERM') {
      try {
        await fs.promises.unlink(filePath);
      } catch {}
      await fs.promises.rename(tempPath, filePath);
    } else {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath).catch(() => {});
      }
      throw err;
    }
  }

  return validated;
}

/**
 * Resets voice configuration file back to standard defaults.
 */
export async function resetVoiceConfig(customPath?: string): Promise<VoiceMappingConfig> {
  return saveVoiceConfig(DEFAULT_VOICE_CONFIG, customPath);
}

/**
 * Returns the configured preferred voice for a given target language.
 */
export function getVoiceForLanguage(config: VoiceMappingConfig, lang: VoiceLanguage): string {
  if (lang === 'ur') return config.ur || DEFAULT_VOICE_CONFIG.ur;
  if (lang === 'ar') return config.ar || DEFAULT_VOICE_CONFIG.ar;
  if (lang === 'mixed') return config.mixed || DEFAULT_VOICE_CONFIG.mixed;
  return config.en || DEFAULT_VOICE_CONFIG.en;
}
