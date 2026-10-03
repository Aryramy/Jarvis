import { z } from 'zod';
import type { VoiceLanguage } from './types.js';

export type TTSAudioFormat = 'mp3' | 'wav' | 'ogg' | 'pcm16';

export interface TTSVoiceInfo {
  id: string;
  name: string;
  language: VoiceLanguage;
  locale: string;
  gender: 'male' | 'female' | 'neutral';
  provider: string;
  isNatural: boolean;
  warmthScore?: number;
  description?: string;
}

export interface TTSOptions {
  voice?: string;
  language?: VoiceLanguage;
  rate?: string | number; // e.g. "+0%", "-10%", or 1.0
  pitch?: string | number; // e.g. "+0Hz", "+2Hz"
  volume?: string | number; // e.g. "+0%", 100
  format?: TTSAudioFormat;
  timeoutMs?: number;
}

export interface TTSAudioResult {
  audioBuffer: Buffer;
  format: TTSAudioFormat;
  provider: string;
  voice: string;
  language: VoiceLanguage;
  latencyMs: number;
  durationMs?: number;
  sampleRate?: number;
  filePath?: string;
  byteLength: number;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  getVoices(): Promise<TTSVoiceInfo[]>;
  synthesize(text: string, options?: TTSOptions): Promise<TTSAudioResult>;
  synthesizeToFile(text: string, outputFilePath: string, options?: TTSOptions): Promise<TTSAudioResult>;
}

export interface BenchmarkPhrase {
  id: string;
  category: 'welcome' | 'technical' | 'conversational';
  language: VoiceLanguage;
  text: string;
}

export interface BenchmarkSampleResult {
  phraseId: string;
  category: string;
  language: VoiceLanguage;
  text: string;
  providerId: string;
  providerName: string;
  voiceId: string;
  success: boolean;
  latencyMs: number;
  byteLength: number;
  filePath?: string;
  error?: string;
  warmthRating: 'High' | 'Medium' | 'Low';
  pronunciationRating: 'Native' | 'Good' | 'Fair';
}

export interface TTSBenchmarkReport {
  timestamp: string;
  totalSamples: number;
  successfulSamples: number;
  failedSamples: number;
  averageLatencyMs: number;
  resultsByLanguage: Record<VoiceLanguage, BenchmarkSampleResult[]>;
  resultsByProvider: Record<string, BenchmarkSampleResult[]>;
  outputDirectory: string;
}

export const synthesizeSpeechInputSchema = z.object({
  text: z.string().min(1, 'Text to synthesize is required'),
  language: z.enum(['en', 'ur', 'ar', 'mixed']).optional(),
  voice: z.string().optional(),
  outputFilePath: z.string().optional(),
  format: z.enum(['mp3', 'wav', 'ogg', 'pcm16']).optional(),
});

export const benchmarkTTSInputSchema = z.object({
  languages: z.array(z.enum(['en', 'ur', 'ar', 'mixed'])).optional(),
  providerIds: z.array(z.string()).optional(),
  outputDirectory: z.string().optional(),
});
