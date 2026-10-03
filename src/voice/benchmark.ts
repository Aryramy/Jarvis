import fs from 'node:fs';
import path from 'node:path';
import type {
  TTSProvider,
  BenchmarkPhrase,
  BenchmarkSampleResult,
  TTSBenchmarkReport,
} from './tts-types.js';
import type { VoiceLanguage } from './types.js';
import { TTSProviderManager } from './tts-manager.js';

export const STANDARD_BENCHMARK_PHRASES: BenchmarkPhrase[] = [
  // English Test Phrases
  {
    id: 'en_welcome',
    category: 'welcome',
    language: 'en',
    text: 'Good morning! I am Jarvis, your voice-first autonomous assistant.',
  },
  {
    id: 'en_technical',
    category: 'technical',
    language: 'en',
    text: 'Power BI and Microsoft Fabric allow real-time interactive business analytics.',
  },
  // Urdu Test Phrases
  {
    id: 'ur_welcome',
    category: 'welcome',
    language: 'ur',
    text: 'صبح بخیر! میں جاروس ہوں، آپ کا آواز پر مبنی بااختیار معاون۔',
  },
  {
    id: 'ur_technical',
    category: 'technical',
    language: 'ur',
    text: 'پاور بی آئی آپ کے کاروباری ڈیٹا کو خوبصورت ڈیش بورڈز میں تبدیل کرتا ہے۔',
  },
  // Arabic Test Phrases
  {
    id: 'ar_welcome',
    category: 'welcome',
    language: 'ar',
    text: 'صباح الخير! أنا جارفيس، مساعدك الصوتي الذكي والمستقل.',
  },
  {
    id: 'ar_technical',
    category: 'technical',
    language: 'ar',
    text: 'يوفر نظام باور بي آي لوحات تحكم تفاعلية متقدمة لتحليل البيانات.',
  },
  // Mixed / Code-Switching
  {
    id: 'mixed_phrase',
    category: 'conversational',
    language: 'mixed',
    text: 'Please open Power BI اور میرے لیے سیلز ڈیش بورڈ دکھائیں۔',
  },
];

export interface RunBenchmarkOptions {
  manager?: TTSProviderManager;
  languages?: VoiceLanguage[];
  providers?: TTSProvider[];
  phrases?: BenchmarkPhrase[];
  outputDirectory?: string;
}

export async function runTTSBenchmark(options?: RunBenchmarkOptions): Promise<TTSBenchmarkReport> {
  const outputDir = path.resolve(options?.outputDirectory || 'data/tts_benchmarks');
  await fs.promises.mkdir(outputDir, { recursive: true });

  const manager = options?.manager || new TTSProviderManager();
  const testPhrases = options?.phrases || STANDARD_BENCHMARK_PHRASES;
  const targetLanguages = new Set(options?.languages || ['en', 'ur', 'ar', 'mixed']);

  const filteredPhrases = testPhrases.filter((p) => targetLanguages.has(p.language));
  const providersToTest = options?.providers || manager.getProviders();

  const allSamples: BenchmarkSampleResult[] = [];
  const resultsByLanguage: Record<VoiceLanguage, BenchmarkSampleResult[]> = {
    en: [],
    ur: [],
    ar: [],
    mixed: [],
  };
  const resultsByProvider: Record<string, BenchmarkSampleResult[]> = {};

  for (const provider of providersToTest) {
    resultsByProvider[provider.id] = [];
    const isAvail = await provider.isAvailable().catch(() => false);
    if (!isAvail) continue;

    const voices = await provider.getVoices().catch(() => []);

    for (const phrase of filteredPhrases) {
      // Find suitable voice for phrase language
      const voice =
        voices.find((v) => v.language === phrase.language) ||
        voices.find((v) => v.language === 'en') ||
        voices[0];

      const voiceId = voice ? voice.id : 'default';
      const ext = provider.id === 'edge-tts' ? 'mp3' : 'wav';
      const filename = `${provider.id}_${phrase.id}.${ext}`;
      const filePath = path.join(outputDir, filename);

      const start = performance.now();
      try {
        const audioResult = await provider.synthesizeToFile(phrase.text, filePath, {
          language: phrase.language,
          voice: voiceId,
          timeoutMs: 4000,
        });

        const latencyMs = audioResult.latencyMs || Math.round(performance.now() - start);
        const stats = await fs.promises.stat(filePath);

        // Warmth and pronunciation ratings
        let warmthRating: 'High' | 'Medium' | 'Low' = 'High';
        let pronunciationRating: 'Native' | 'Good' | 'Fair' = 'Native';

        if (provider.id === 'windows-sapi') {
          warmthRating = 'Medium';
          pronunciationRating = phrase.language === 'en' ? 'Good' : 'Fair';
        } else if (provider.id === 'mock-tts') {
          warmthRating = 'High';
          pronunciationRating = 'Native';
        }

        const sampleResult: BenchmarkSampleResult = {
          phraseId: phrase.id,
          category: phrase.category,
          language: phrase.language,
          text: phrase.text,
          providerId: provider.id,
          providerName: provider.name,
          voiceId,
          success: true,
          latencyMs,
          byteLength: stats.size,
          filePath,
          warmthRating,
          pronunciationRating,
        };

        allSamples.push(sampleResult);
        resultsByLanguage[phrase.language].push(sampleResult);
        resultsByProvider[provider.id].push(sampleResult);
      } catch (err: any) {
        const latencyMs = Math.round(performance.now() - start);
        const sampleResult: BenchmarkSampleResult = {
          phraseId: phrase.id,
          category: phrase.category,
          language: phrase.language,
          text: phrase.text,
          providerId: provider.id,
          providerName: provider.name,
          voiceId,
          success: false,
          latencyMs,
          byteLength: 0,
          error: err.message,
          warmthRating: 'Low',
          pronunciationRating: 'Fair',
        };

        allSamples.push(sampleResult);
        resultsByLanguage[phrase.language].push(sampleResult);
        resultsByProvider[provider.id].push(sampleResult);
      }
    }
  }

  const successful = allSamples.filter((s) => s.success);
  const totalLatency = successful.reduce((sum, s) => sum + s.latencyMs, 0);
  const averageLatencyMs = successful.length > 0 ? Math.round(totalLatency / successful.length) : 0;

  return {
    timestamp: new Date().toISOString(),
    totalSamples: allSamples.length,
    successfulSamples: successful.length,
    failedSamples: allSamples.length - successful.length,
    averageLatencyMs,
    resultsByLanguage,
    resultsByProvider,
    outputDirectory: outputDir,
  };
}
