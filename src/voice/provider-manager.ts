import fs from 'node:fs';
import type {
  STTProvider,
  AudioInput,
  AudioFormat,
  STTOptions,
  TranscriptionResult,
} from './types.js';
import { detectLanguage } from './lang-detector.js';
import { MockSTTProvider } from './providers/mock.js';
import { WhisperCloudSTTProvider } from './providers/whisper-cloud.js';

export interface STTProviderManagerOptions {
  providers?: STTProvider[];
  fallbackToMock?: boolean;
}

export class STTProviderManager {
  private providers: STTProvider[] = [];

  constructor(options?: STTProviderManagerOptions) {
    if (options?.providers && options.providers.length > 0) {
      this.providers = [...options.providers];
    } else {
      // Default priority chain: Hosted Whisper -> Mock Fallback
      this.providers = [
        new WhisperCloudSTTProvider(),
        new MockSTTProvider(),
      ];
    }

    if (options?.fallbackToMock && !this.providers.some((p) => p instanceof MockSTTProvider)) {
      this.providers.push(new MockSTTProvider());
    }
  }

  registerProvider(provider: STTProvider, highPriority = false): void {
    if (highPriority) {
      this.providers.unshift(provider);
    } else {
      this.providers.push(provider);
    }
  }

  getProviders(): STTProvider[] {
    return [...this.providers];
  }

  async getAvailableProviders(): Promise<STTProvider[]> {
    const available: STTProvider[] = [];
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        available.push(provider);
      }
    }
    return available;
  }

  /**
   * Transcribes audio using the highest-priority available provider,
   * automatically failing over to subsequent providers if an error occurs.
   */
  async transcribe(audio: AudioInput, options?: STTOptions): Promise<TranscriptionResult> {
    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        const isAvail = await provider.isAvailable();
        if (!isAvail) continue;

        const result = await provider.transcribe(audio, options);

        // Run secondary language detection enrichment to guarantee consistent metadata
        const langResult = detectLanguage(result.text, result.language);
        return {
          ...result,
          language: langResult.language,
          isCodeSwitched: langResult.isCodeSwitched,
          detectedPhrases: langResult.detectedPhrases,
        };
      } catch (err: any) {
        lastError = err;
        console.warn(`[STTProviderManager] Provider "${provider.name}" failed: ${err.message}. Trying next fallback...`);
      }
    }

    throw new Error(
      `[STTProviderManager] All speech-to-text providers failed. Last error: ${lastError?.message || 'No available providers'}`
    );
  }

  /**
   * Convenience method to transcribe an in-memory audio buffer.
   */
  async transcribeBuffer(
    buffer: Buffer | Uint8Array,
    format: AudioFormat = 'wav',
    options?: STTOptions
  ): Promise<TranscriptionResult> {
    return this.transcribe({ buffer, format }, options);
  }

  /**
   * Convenience method to transcribe an audio file on disk.
   */
  async transcribeFile(filePath: string, options?: STTOptions): Promise<TranscriptionResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[STTProviderManager] Audio file not found at path: ${filePath}`);
    }

    const buffer = await fs.promises.readFile(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase();
    const format: AudioFormat =
      ext === 'mp3' ? 'mp3' : ext === 'webm' ? 'webm' : ext === 'ogg' ? 'ogg' : 'wav';

    return this.transcribe({ buffer, format, filePath }, options);
  }
}
