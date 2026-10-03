import OpenAI, { toFile } from 'openai';
import { loadConfig } from '../../config/index.js';
import type {
  STTProvider,
  AudioInput,
  STTOptions,
  TranscriptionResult,
} from '../types.js';
import { detectLanguage } from '../lang-detector.js';

export interface WhisperCloudSTTOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class WhisperCloudSTTProvider implements STTProvider {
  readonly id = 'whisper-cloud';
  readonly name = 'OpenAI / Hosted Whisper STT';
  private client: OpenAI;
  private model: string;

  constructor(options?: WhisperCloudSTTOptions) {
    const config = loadConfig();
    this.client = new OpenAI({
      apiKey: options?.apiKey ?? config.CHEAPERINFERENCE_API_KEY,
      baseURL: options?.baseURL ?? config.CHEAPERINFERENCE_BASE_URL,
      timeout: 30000,
    });
    this.model = options?.model ?? 'whisper-1';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const config = loadConfig();
      return Boolean(config.CHEAPERINFERENCE_API_KEY);
    } catch {
      return false;
    }
  }

  async transcribe(audio: AudioInput, options?: STTOptions): Promise<TranscriptionResult> {
    const filename = audio.filePath
      ? audio.filePath.split(/[/\\]/).pop() || 'audio.wav'
      : `audio.${audio.format ?? 'wav'}`;

    const mimeType = audio.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    const uploadableFile = await toFile(audio.buffer, filename, { type: mimeType });

    const langParam = options?.languageHint && options.languageHint !== 'auto'
      ? options.languageHint
      : undefined;

    const response = await this.client.audio.transcriptions.create({
      file: uploadableFile,
      model: this.model,
      language: langParam,
      prompt: options?.prompt,
      response_format: 'verbose_json',
    });

    const text = response.text || '';
    const langDetect = detectLanguage(text, options?.languageHint);

    return {
      text,
      language: langDetect.language,
      confidence: langDetect.confidence,
      provider: this.id,
      durationMs: audio.durationMs,
      isCodeSwitched: langDetect.isCodeSwitched,
      detectedPhrases: langDetect.detectedPhrases,
      segments: response.segments?.map((seg: any) => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        confidence: 0.95,
      })),
    };
  }
}
