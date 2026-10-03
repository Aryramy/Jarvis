import { z } from 'zod';

export type VoiceLanguage = 'en' | 'ur' | 'ar' | 'mixed';
export type AudioFormat = 'wav' | 'mp3' | 'webm' | 'ogg' | 'pcm16';

export interface AudioInput {
  buffer: Buffer | Uint8Array;
  format?: AudioFormat;
  sampleRate?: number;
  channels?: number;
  filePath?: string;
  durationMs?: number;
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence: number;
  language?: VoiceLanguage;
  words?: TranscriptionWord[];
}

export interface DetectedPhrase {
  text: string;
  language: 'en' | 'ur' | 'ar';
}

export interface TranscriptionResult {
  text: string;
  language: VoiceLanguage;
  confidence: number;
  provider: string;
  durationMs?: number;
  segments?: TranscriptionSegment[];
  isCodeSwitched?: boolean;
  detectedPhrases?: DetectedPhrase[];
}

export interface STTOptions {
  languageHint?: 'en' | 'ur' | 'ar' | 'auto';
  temperature?: number;
  prompt?: string;
  timestampGranularity?: 'segment' | 'word';
}

export interface STTProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  transcribe(audio: AudioInput, options?: STTOptions): Promise<TranscriptionResult>;
}

export const transcribeAudioInputSchema = z.object({
  audioBase64: z.string().optional(),
  filePath: z.string().optional(),
  languageHint: z.enum(['en', 'ur', 'ar', 'auto']).optional(),
  prompt: z.string().optional(),
});
