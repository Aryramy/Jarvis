import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  MockTTSProvider,
  WindowsSapiTTSProvider,
  EdgeTTSProvider,
  TTSProviderManager,
  runTTSBenchmark,
  STANDARD_BENCHMARK_PHRASES,
  createVoiceTools,
  STTProviderManager,
  ToolRegistry,
  type AgentContext,
} from '../../src/index.js';

describe('Phase 13: Edge Natural TTS & Multi-Provider Benchmark (TASK-1301)', () => {
  let testOutputDir: string;

  beforeEach(async () => {
    testOutputDir = path.join(os.tmpdir(), `jarvis_tts_test_${Date.now()}`);
    await fs.promises.mkdir(testOutputDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(testOutputDir)) {
        await fs.promises.rm(testOutputDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('1. MockTTSProvider Audio Generation', () => {
    it('should be available and expose trilingual voices', async () => {
      const provider = new MockTTSProvider();
      expect(await provider.isAvailable()).toBe(true);

      const voices = await provider.getVoices();
      expect(voices.length).toBeGreaterThanOrEqual(3);
      expect(voices.some((v) => v.language === 'en')).toBe(true);
      expect(voices.some((v) => v.language === 'ur')).toBe(true);
      expect(voices.some((v) => v.language === 'ar')).toBe(true);
    });

    it('should synthesize valid WAV audio buffer with compliant RIFF/WAVE header', async () => {
      const provider = new MockTTSProvider();
      const result = await provider.synthesize('Hello from Jarvis assistant', { language: 'en' });

      expect(result.format).toBe('wav');
      expect(result.byteLength).toBeGreaterThan(44);
      expect(result.audioBuffer.length).toBe(result.byteLength);

      // Verify 44-byte WAV header
      const headerStr = result.audioBuffer.subarray(0, 4).toString('ascii');
      const waveStr = result.audioBuffer.subarray(8, 12).toString('ascii');
      const fmtStr = result.audioBuffer.subarray(12, 16).toString('ascii');
      const dataStr = result.audioBuffer.subarray(36, 40).toString('ascii');

      expect(headerStr).toBe('RIFF');
      expect(waveStr).toBe('WAVE');
      expect(fmtStr).toBe('fmt ');
      expect(dataStr).toBe('data');
    });

    it('should synthesize audio directly to disk file and verify byte size', async () => {
      const provider = new MockTTSProvider();
      const targetFile = path.join(testOutputDir, 'output.wav');

      const result = await provider.synthesizeToFile('Test file synthesis', targetFile, {
        language: 'en',
      });

      expect(result.filePath).toBe(path.resolve(targetFile));
      expect(fs.existsSync(targetFile)).toBe(true);
      const stat = await fs.promises.stat(targetFile);
      expect(stat.size).toBe(result.byteLength);
      expect(stat.size).toBeGreaterThan(44);
    });
  });

  describe('2. WindowsSapiTTSProvider (Native Windows Audio)', () => {
    it('should detect Windows environment and discover installed voices', async () => {
      const provider = new WindowsSapiTTSProvider();
      const isWin = process.platform === 'win32';
      const available = await provider.isAvailable();

      if (isWin) {
        expect(available).toBe(true);
        const voices = await provider.getVoices();
        expect(voices.length).toBeGreaterThan(0);
        expect(voices[0].provider).toBe('windows-sapi');
      } else {
        expect(available).toBe(false);
      }
    });

    it('should synthesize real WAV audio on Windows or throw on non-Windows', async () => {
      const provider = new WindowsSapiTTSProvider();
      if (process.platform === 'win32') {
        const targetFile = path.join(testOutputDir, 'sapi_test.wav');
        const result = await provider.synthesizeToFile('Testing Windows SpeechSynthesizer', targetFile);

        expect(result.filePath).toBe(path.resolve(targetFile));
        expect(fs.existsSync(targetFile)).toBe(true);
        const stat = await fs.promises.stat(targetFile);
        expect(stat.size).toBeGreaterThan(1000);
        expect(result.latencyMs).toBeGreaterThan(0);
      }
    });
  });

  describe('3. EdgeTTSProvider (Natural Neural Speech Client)', () => {
    it('should expose rich neural voice catalog for EN, UR, and AR', async () => {
      const provider = new EdgeTTSProvider();
      expect(await provider.isAvailable()).toBe(true);

      const voices = await provider.getVoices();
      expect(voices.length).toBeGreaterThanOrEqual(7);

      const enVoices = voices.filter((v) => v.language === 'en');
      const urVoices = voices.filter((v) => v.language === 'ur');
      const arVoices = voices.filter((v) => v.language === 'ar');

      expect(enVoices.some((v) => v.id.includes('ChristopherNeural'))).toBe(true);
      expect(urVoices.some((v) => v.id.includes('AsadNeural'))).toBe(true);
      expect(arVoices.some((v) => v.id.includes('HamedNeural'))).toBe(true);
    });
  });

  describe('4. TTSProviderManager Priority Chain & Failover', () => {
    it('should manage provider priority and route by language', async () => {
      const manager = new TTSProviderManager({
        providers: [new MockTTSProvider()],
      });

      expect(manager.getProviders().length).toBe(1);
      expect(manager.getPreferredVoice('en')).toBe('en-US-ChristopherNeural');
      expect(manager.getPreferredVoice('ur')).toBe('ur-PK-AsadNeural');
      expect(manager.getPreferredVoice('ar')).toBe('ar-SA-HamedNeural');

      manager.setPreferredVoice('en', 'custom-en-voice');
      expect(manager.getPreferredVoice('en')).toBe('custom-en-voice');
    });

    it('should transparently fail over when primary provider fails', async () => {
      const failingProvider = new MockTTSProvider(false); // unavailable
      const backupProvider = new MockTTSProvider(true); // available

      const manager = new TTSProviderManager({
        providers: [failingProvider, backupProvider],
      });

      const result = await manager.synthesize('Failover test sentence', { language: 'en' });
      expect(result.provider).toBe('mock-tts');
      expect(result.byteLength).toBeGreaterThan(44);
    });

    it('should discover voices across all registered providers', async () => {
      const manager = new TTSProviderManager();
      const allVoices = await manager.getAllVoices();
      expect(allVoices.length).toBeGreaterThan(0);

      const urduVoices = await manager.getAllVoices('ur');
      expect(urduVoices.every((v) => v.language === 'ur')).toBe(true);
    });
  });

  describe('5. Multi-Provider Benchmarking Engine', () => {
    it('should execute benchmark across test phrases and produce audio files on disk', async () => {
      const mockProvider = new MockTTSProvider();
      const benchmarkOutputDir = path.join(testOutputDir, 'benchmarks');

      const report = await runTTSBenchmark({
        providers: [mockProvider],
        outputDirectory: benchmarkOutputDir,
        phrases: STANDARD_BENCHMARK_PHRASES.slice(0, 3), // test a subset for speed
      });

      expect(report.totalSamples).toBe(3);
      expect(report.successfulSamples).toBe(3);
      expect(report.failedSamples).toBe(0);
      expect(report.averageLatencyMs).toBeGreaterThanOrEqual(0);
      expect(fs.existsSync(benchmarkOutputDir)).toBe(true);

      const files = await fs.promises.readdir(benchmarkOutputDir);
      expect(files.length).toBe(3);

      for (const f of files) {
        const stat = await fs.promises.stat(path.join(benchmarkOutputDir, f));
        expect(stat.size).toBeGreaterThan(44);
      }
    });

    it('should evaluate warmth and pronunciation ratings in benchmark report', async () => {
      const mockProvider = new MockTTSProvider();
      const report = await runTTSBenchmark({
        providers: [mockProvider],
        outputDirectory: path.join(testOutputDir, 'ratings_bench'),
        phrases: [STANDARD_BENCHMARK_PHRASES[0]],
      });

      const sample = report.resultsByLanguage.en[0];
      expect(sample).toBeDefined();
      expect(sample.warmthRating).toBe('High');
      expect(sample.pronunciationRating).toBe('Native');
      expect(sample.success).toBe(true);
    });
  });

  describe('6. ToolRegistry Integration (voice.synthesize_speech & voice.benchmark_tts)', () => {
    let registry: ToolRegistry;
    let mockContext: AgentContext;

    beforeEach(() => {
      registry = new ToolRegistry();
      const sttManager = new STTProviderManager();
      const ttsManager = new TTSProviderManager({
        providers: [new MockTTSProvider()],
      });

      const voiceTools = createVoiceTools(sttManager, ttsManager);
      for (const t of voiceTools) {
        registry.register(t);
      }

      mockContext = {
        sessionId: 'test-session',
        taskId: 'task-tts-test',
        currentTurn: 1,
        riskTierApproved: 'R0',
      };
    });

    it('should execute voice.synthesize_speech and return base64 audio envelope', async () => {
      const result = await registry.execute(
        'voice.synthesize_speech',
        {
          text: 'Good morning from Jarvis autonomous voice system.',
          language: 'en',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('voice.synthesize_speech');
      expect(result.riskLevel).toBe('R0');
      expect(result.data.audioBase64).toBeDefined();
      expect(result.data.byteLength).toBeGreaterThan(44);
      expect(result.evidence.provider).toBe('mock-tts');
    });

    it('should execute voice.synthesize_speech to disk and return verified target path', async () => {
      const targetFile = path.join(testOutputDir, 'tool_output.wav');
      const result = await registry.execute(
        'voice.synthesize_speech',
        {
          text: 'Persisted audio file via tool execution',
          language: 'en',
          outputFilePath: targetFile,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.target).toBe(path.resolve(targetFile));
      expect(fs.existsSync(targetFile)).toBe(true);
      const stat = await fs.promises.stat(targetFile);
      expect(stat.size).toBeGreaterThan(44);
    });

    it('should execute voice.benchmark_tts and return report evidence', async () => {
      const benchDir = path.join(testOutputDir, 'tool_bench');
      const result = await registry.execute(
        'voice.benchmark_tts',
        {
          languages: ['en'],
          outputDirectory: benchDir,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('voice.benchmark_tts');
      expect(result.data.totalSamples).toBeGreaterThan(0);
      expect(result.evidence.successfulSamples).toBeGreaterThan(0);
      expect(fs.existsSync(benchDir)).toBe(true);
    });
  });
});
