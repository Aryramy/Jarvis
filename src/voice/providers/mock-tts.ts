import fs from 'node:fs';
import path from 'node:path';
import type {
  TTSProvider,
  TTSVoiceInfo,
  TTSOptions,
  TTSAudioResult,
} from '../tts-types.js';
import type { VoiceLanguage } from '../types.js';

export class MockTTSProvider implements TTSProvider {
  readonly id = 'mock-tts';
  readonly name = 'Mock Synthetic TTS Provider';
  private available = true;

  constructor(isAvailable = true) {
    this.available = isAvailable;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async getVoices(): Promise<TTSVoiceInfo[]> {
    return [
      {
        id: 'mock-en-natural',
        name: 'Mock English Natural Voice',
        language: 'en',
        locale: 'en-US',
        gender: 'male',
        provider: this.id,
        isNatural: true,
        warmthScore: 8.5,
        description: 'Simulated high-warmth neural English voice',
      },
      {
        id: 'mock-ur-natural',
        name: 'Mock Urdu Natural Voice',
        language: 'ur',
        locale: 'ur-PK',
        gender: 'female',
        provider: this.id,
        isNatural: true,
        warmthScore: 8.8,
        description: 'Simulated expressive Urdu voice',
      },
      {
        id: 'mock-ar-natural',
        name: 'Mock Arabic Natural Voice',
        language: 'ar',
        locale: 'ar-SA',
        gender: 'male',
        provider: this.id,
        isNatural: true,
        warmthScore: 8.7,
        description: 'Simulated clear modern standard Arabic voice',
      },
    ];
  }

  /**
   * Generates a valid 16kHz Mono 16-bit PCM WAV audio buffer.
   */
  private createValidWavBuffer(durationSeconds = 1.0, sampleRate = 16000): Buffer {
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const numSamples = Math.floor(durationSeconds * sampleRate);
    const dataSize = numSamples * blockAlign;
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);

    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);

    // fmt subchunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size for PCM
    buffer.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34); // BitsPerSample

    // data subchunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Write subtle synthetic sine tone (440Hz A4) to create actual audible wave
    const frequency = 440.0;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * frequency * t) * 0.3; // 30% volume
      const intSample = Math.floor(sample * 32767);
      buffer.writeInt16LE(intSample, 44 + i * bytesPerSample);
    }

    return buffer;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSAudioResult> {
    if (!this.available) {
      throw new Error(`[MockTTSProvider] Provider "${this.name}" is currently unavailable.`);
    }

    const start = performance.now();
    const lang: VoiceLanguage = options?.language || 'en';
    const voice = options?.voice || (lang === 'ur' ? 'mock-ur-natural' : lang === 'ar' ? 'mock-ar-natural' : 'mock-en-natural');
    
    // Estimate audio duration based on average speaking rate (approx 15 chars per second)
    const durationSeconds = Math.max(0.5, Math.min(10.0, text.length / 15.0));
    const audioBuffer = this.createValidWavBuffer(durationSeconds);
    const latencyMs = Math.round(performance.now() - start);

    return {
      audioBuffer,
      format: 'wav',
      provider: this.id,
      voice,
      language: lang,
      latencyMs,
      durationMs: Math.round(durationSeconds * 1000),
      sampleRate: 16000,
      byteLength: audioBuffer.length,
    };
  }

  async synthesizeToFile(
    text: string,
    outputFilePath: string,
    options?: TTSOptions
  ): Promise<TTSAudioResult> {
    const result = await this.synthesize(text, options);
    const resolvedPath = path.resolve(outputFilePath);
    await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.promises.writeFile(resolvedPath, result.audioBuffer);

    return {
      ...result,
      filePath: resolvedPath,
    };
  }
}
