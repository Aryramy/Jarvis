import fs from 'node:fs';
import path from 'node:path';
import type {
  TTSProvider,
  TTSVoiceInfo,
  TTSOptions,
  TTSAudioResult,
} from './tts-types.js';
import type { VoiceLanguage } from './types.js';
import { EdgeTTSProvider } from './providers/edge-tts.js';
import { WindowsSapiTTSProvider } from './providers/windows-sapi.js';
import { MockTTSProvider } from './providers/mock-tts.js';

export interface TTSProviderManagerOptions {
  providers?: TTSProvider[];
  fallbackToMock?: boolean;
  preferredVoices?: Partial<Record<VoiceLanguage, string>>;
}

export class TTSProviderManager {
  private providers: TTSProvider[] = [];
  private preferredVoices: Record<VoiceLanguage, string> = {
    en: 'en-US-ChristopherNeural',
    ur: 'ur-PK-AsadNeural',
    ar: 'ar-SA-HamedNeural',
    mixed: 'en-US-ChristopherNeural',
  };

  constructor(options?: TTSProviderManagerOptions) {
    if (options?.preferredVoices) {
      this.preferredVoices = {
        ...this.preferredVoices,
        ...options.preferredVoices,
      };
    }

    if (options?.providers && options.providers.length > 0) {
      this.providers = [...options.providers];
    } else {
      // Default priority chain: Edge Natural Neural -> Windows SAPI -> Mock Fallback
      this.providers = [
        new EdgeTTSProvider(),
        new WindowsSapiTTSProvider(),
        new MockTTSProvider(),
      ];
    }

    if (options?.fallbackToMock && !this.providers.some((p) => p instanceof MockTTSProvider)) {
      this.providers.push(new MockTTSProvider());
    }
  }

  registerProvider(provider: TTSProvider, highPriority = false): void {
    if (highPriority) {
      this.providers.unshift(provider);
    } else {
      this.providers.push(provider);
    }
  }

  getProviders(): TTSProvider[] {
    return [...this.providers];
  }

  async getAvailableProviders(): Promise<TTSProvider[]> {
    const available: TTSProvider[] = [];
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) {
          available.push(provider);
        }
      } catch {
        // Skip unavailable provider
      }
    }
    return available;
  }

  setPreferredVoice(language: VoiceLanguage, voiceId: string): void {
    this.preferredVoices[language] = voiceId;
  }

  getPreferredVoice(language: VoiceLanguage): string {
    return this.preferredVoices[language] || this.preferredVoices.en;
  }

  getPreferredVoices(): Record<VoiceLanguage, string> {
    return { ...this.preferredVoices };
  }

  /**
   * Synchronizes preferred voices from persistent voice configuration file on disk.
   */
  async syncVoiceConfig(customPath?: string): Promise<void> {
    try {
      const { loadVoiceConfig } = await import('./voice-config.js');
      const loaded = await loadVoiceConfig(customPath);
      this.preferredVoices = {
        en: loaded.en,
        ur: loaded.ur,
        ar: loaded.ar,
        mixed: loaded.mixed,
      };
    } catch {
      // Keep existing preferred voices if disk read fails
    }
  }

  /**
   * Discovers and aggregates available voices from all providers,
   * optionally filtered by target language.
   */
  async getAllVoices(language?: VoiceLanguage): Promise<TTSVoiceInfo[]> {
    const allVoices: TTSVoiceInfo[] = [];
    for (const provider of this.providers) {
      try {
        const voices = await provider.getVoices();
        for (const v of voices) {
          if (!language || v.language === language) {
            allVoices.push(v);
          }
        }
      } catch (err: any) {
        console.warn(`[TTSProviderManager] Failed to get voices from ${provider.name}: ${err.message}`);
      }
    }
    return allVoices;
  }

  /**
   * Synthesizes text to speech with automatic failover across registered providers.
   */
  async synthesize(text: string, options?: TTSOptions): Promise<TTSAudioResult> {
    const lang = options?.language || 'en';
    const effectiveOptions: TTSOptions = {
      ...options,
      language: lang,
      voice: options?.voice || this.getPreferredVoice(lang),
    };

    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        const isAvail = await provider.isAvailable().catch(() => false);
        if (!isAvail) continue;

        const result = await provider.synthesize(text, effectiveOptions);
        return result;
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[TTSProviderManager] Provider "${provider.name}" failed: ${err.message}. Failing over to next provider in priority chain...`
        );
      }
    }

    throw new Error(
      `[TTSProviderManager] All TTS providers failed. Last error: ${lastError?.message || 'No available providers'}`
    );
  }

  /**
   * Synthesizes text to an audio file on disk with automatic failover.
   */
  async synthesizeToFile(
    text: string,
    outputFilePath: string,
    options?: TTSOptions
  ): Promise<TTSAudioResult> {
    const lang = options?.language || 'en';
    const effectiveOptions: TTSOptions = {
      ...options,
      language: lang,
      voice: options?.voice || this.getPreferredVoice(lang),
    };

    const resolvedPath = path.resolve(outputFilePath);
    await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });

    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        const isAvail = await provider.isAvailable().catch(() => false);
        if (!isAvail) continue;

        const result = await provider.synthesizeToFile(text, resolvedPath, effectiveOptions);
        return result;
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[TTSProviderManager] Provider "${provider.name}" failed to write file: ${err.message}. Failing over to next provider in priority chain...`
        );
      }
    }

    throw new Error(
      `[TTSProviderManager] All TTS providers failed for synthesizeToFile. Last error: ${lastError?.message || 'No available providers'}`
    );
  }
}
