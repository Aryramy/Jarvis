import type {
  STTProvider,
  AudioInput,
  STTOptions,
  TranscriptionResult,
} from '../types.js';
import { detectLanguage } from '../lang-detector.js';

export interface MockSTTProviderOptions {
  id?: string;
  name?: string;
  isAvailable?: boolean;
  defaultText?: string;
  phraseMap?: Map<string, string>;
}

export class MockSTTProvider implements STTProvider {
  readonly id: string;
  readonly name: string;
  private available: boolean;
  private defaultText: string;
  private phraseMap: Map<string, string>;

  constructor(options?: MockSTTProviderOptions) {
    this.id = options?.id ?? 'mock-stt';
    this.name = options?.name ?? 'Mock STT Provider';
    this.available = options?.isAvailable ?? true;
    this.defaultText = options?.defaultText ?? 'Hello JARVIS open Google and search for latest news';
    this.phraseMap = options?.phraseMap ?? new Map();
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  registerPhrase(key: string, text: string): void {
    this.phraseMap.set(key.toLowerCase(), text);
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async transcribe(audio: AudioInput, options?: STTOptions): Promise<TranscriptionResult> {
    if (!this.available) {
      throw new Error(`[MockSTTProvider] Provider ${this.name} is currently unavailable.`);
    }

    // Determine output text based on options or phrase map
    let text = this.defaultText;
    if (options?.languageHint === 'ur') {
      text = 'گوگل پر سرچ کریں اور تازہ ترین خبریں دکھائیں';
    } else if (options?.languageHint === 'ar') {
      text = 'افتح المتصفح واذهب إلى موقع الأخبار';
    } else if (options?.prompt && this.phraseMap.has(options.prompt.toLowerCase())) {
      text = this.phraseMap.get(options.prompt.toLowerCase())!;
    } else if (audio.filePath && this.phraseMap.has(audio.filePath.toLowerCase())) {
      text = this.phraseMap.get(audio.filePath.toLowerCase())!;
    }

    // Run language detection
    const langDetection = detectLanguage(text, options?.languageHint);

    return {
      text,
      language: langDetection.language,
      confidence: langDetection.confidence,
      provider: this.id,
      durationMs: audio.durationMs ?? 2500,
      isCodeSwitched: langDetection.isCodeSwitched,
      detectedPhrases: langDetection.detectedPhrases,
      segments: [
        {
          id: 0,
          start: 0,
          end: 2.5,
          text,
          confidence: langDetection.confidence,
          language: langDetection.language,
        },
      ],
    };
  }
}
