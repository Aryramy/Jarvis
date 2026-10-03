import fs from 'node:fs';
import path from 'node:path';
import type { VoiceLanguage } from './types.js';
import type { TTSVoiceInfo } from './tts-types.js';
import { TTSProviderManager } from './tts-manager.js';
import { loadVoiceConfig, type VoiceMappingConfig } from './voice-config.js';

export const STANDARD_AUDITION_PHRASES: Record<VoiceLanguage, string> = {
  en: 'Greetings! I am Jarvis, your autonomous voice assistant, ready to assist you.',
  ur: 'السلام علیکم! میں جاروس ہوں، آپ کا ذہین اور بااختیار معاون۔',
  ar: 'مرحباً بك! أنا جارفيس، مساعدك الصوتي الذكي في خدمتك دائماً.',
  mixed: 'Hello! I can speak English اور اردو دونوں زبانوں میں روانی کے ساتھ۔',
};

export interface AuditionSampleResult {
  voiceId: string;
  voiceName: string;
  language: VoiceLanguage;
  locale: string;
  gender: 'male' | 'female' | 'neutral';
  provider: string;
  isNatural: boolean;
  warmthScore: number;
  phrase: string;
  filePath: string;
  byteLength: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface AuditionReport {
  timestamp: string;
  totalCandidates: number;
  samplesGenerated: number;
  currentConfig: VoiceMappingConfig;
  recommendedVoices: Record<VoiceLanguage, string>;
  samplesByLanguage: Record<VoiceLanguage, AuditionSampleResult[]>;
  outputDirectory: string;
}

export interface GenerateAuditionOptions {
  manager?: TTSProviderManager;
  languages?: VoiceLanguage[];
  outputDirectory?: string;
  phrases?: Partial<Record<VoiceLanguage, string>>;
}

/**
 * Discovers and groups candidate voices available for auditioning.
 */
export async function getAuditionCandidates(
  manager: TTSProviderManager = new TTSProviderManager()
): Promise<Record<VoiceLanguage, TTSVoiceInfo[]>> {
  const allVoices = await manager.getAllVoices();
  const grouped: Record<VoiceLanguage, TTSVoiceInfo[]> = {
    en: [],
    ur: [],
    ar: [],
    mixed: [],
  };

  for (const v of allVoices) {
    if (grouped[v.language]) {
      grouped[v.language].push(v);
    }
  }

  return grouped;
}

/**
 * Synthesizes a standardized listening sample for a specific voice candidate.
 */
export async function generateSingleAuditionSample(
  voice: TTSVoiceInfo,
  outputDir: string,
  manager: TTSProviderManager,
  customPhrase?: string
): Promise<AuditionSampleResult> {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const phrase = customPhrase || STANDARD_AUDITION_PHRASES[voice.language] || STANDARD_AUDITION_PHRASES.en;
  const safeVoiceId = voice.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = voice.provider === 'edge-tts' ? 'mp3' : 'wav';
  const fileName = `audition_${voice.language}_${safeVoiceId}.${ext}`;
  const filePath = path.join(outputDir, fileName);

  const start = performance.now();
  try {
    const specificProvider = manager.getProviders().find((p) => p.id === voice.provider);
    let result;

    if (specificProvider && (await specificProvider.isAvailable().catch(() => false))) {
      result = await specificProvider.synthesizeToFile(phrase, filePath, {
        language: voice.language,
        voice: voice.id,
        timeoutMs: 5000,
      });
    } else {
      result = await manager.synthesizeToFile(phrase, filePath, {
        language: voice.language,
        voice: voice.id,
        timeoutMs: 5000,
      });
    }

    const latencyMs = result.latencyMs || Math.round(performance.now() - start);
    const stats = await fs.promises.stat(filePath);

    return {
      voiceId: voice.id,
      voiceName: voice.name,
      language: voice.language,
      locale: voice.locale,
      gender: voice.gender,
      provider: voice.provider,
      isNatural: voice.isNatural,
      warmthScore: voice.warmthScore || 7.0,
      phrase,
      filePath,
      byteLength: stats.size,
      latencyMs,
      success: true,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      voiceId: voice.id,
      voiceName: voice.name,
      language: voice.language,
      locale: voice.locale,
      gender: voice.gender,
      provider: voice.provider,
      isNatural: voice.isNatural,
      warmthScore: voice.warmthScore || 5.0,
      phrase,
      filePath,
      byteLength: 0,
      latencyMs,
      success: false,
      error: err.message,
    };
  }
}

/**
 * Runs standardized voice audition across all languages and candidate voices.
 */
export async function runVoiceAudition(options?: GenerateAuditionOptions): Promise<AuditionReport> {
  const outputDir = path.resolve(options?.outputDirectory || path.join(process.cwd(), 'data', 'auditions'));
  await fs.promises.mkdir(outputDir, { recursive: true });

  const manager = options?.manager || new TTSProviderManager();
  const currentConfig = await loadVoiceConfig();
  const candidatesByLang = await getAuditionCandidates(manager);

  const targetLangs = options?.languages || (['en', 'ur', 'ar'] as VoiceLanguage[]);
  const samplesByLanguage: Record<VoiceLanguage, AuditionSampleResult[]> = {
    en: [],
    ur: [],
    ar: [],
    mixed: [],
  };

  let totalCandidates = 0;
  let samplesGenerated = 0;

  for (const lang of targetLangs) {
    const candidates = candidatesByLang[lang] || [];
    totalCandidates += candidates.length;

    for (const voice of candidates) {
      const phrase = options?.phrases?.[lang];
      const sample = await generateSingleAuditionSample(voice, outputDir, manager, phrase);
      samplesByLanguage[lang].push(sample);
      if (sample.success) {
        samplesGenerated++;
      }
    }
  }

  // Calculate recommended voices based on naturalness and highest warmth score
  const recommendedVoices: Record<VoiceLanguage, string> = {
    en: currentConfig.en,
    ur: currentConfig.ur,
    ar: currentConfig.ar,
    mixed: currentConfig.mixed,
  };

  for (const lang of targetLangs) {
    const samples = samplesByLanguage[lang] || [];
    const successfulSamples = samples.filter((s) => s.success);
    if (successfulSamples.length > 0) {
      successfulSamples.sort((a, b) => b.warmthScore - a.warmthScore);
      recommendedVoices[lang] = successfulSamples[0].voiceId;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalCandidates,
    samplesGenerated,
    currentConfig,
    recommendedVoices,
    samplesByLanguage,
    outputDirectory: outputDir,
  };
}
