import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getAuditionCandidates,
  generateSingleAuditionSample,
  runVoiceAudition,
  parseCliArgs,
  TTSProviderManager,
  MockTTSProvider,
  createVoiceTools,
  STTProviderManager,
  ToolRegistry,
  type AgentContext,
  STANDARD_AUDITION_PHRASES,
} from '../../src/index.js';

describe('Phase 14: Voice Audition Utility & Tools (TASK-1401)', () => {
  let auditionTempDir: string;
  let mockManager: TTSProviderManager;

  beforeEach(async () => {
    auditionTempDir = path.join(os.tmpdir(), `jarvis_audition_test_${Date.now()}`);
    await fs.promises.mkdir(auditionTempDir, { recursive: true });

    mockManager = new TTSProviderManager({
      providers: [new MockTTSProvider()],
    });
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(auditionTempDir)) {
        await fs.promises.rm(auditionTempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('1. Audition Candidates & Sample Generation', () => {
    it('should group candidate voices into English, Urdu, and Arabic', async () => {
      const candidates = await getAuditionCandidates(mockManager);
      expect(candidates.en.length).toBeGreaterThan(0);
      expect(candidates.ur.length).toBeGreaterThan(0);
      expect(candidates.ar.length).toBeGreaterThan(0);
      expect(candidates.en.every((v) => v.language === 'en')).toBe(true);
    });

    it('should synthesize a single standardized audition audio file on disk', async () => {
      const candidates = await getAuditionCandidates(mockManager);
      const testVoice = candidates.en[0];

      const sample = await generateSingleAuditionSample(
        testVoice,
        auditionTempDir,
        mockManager,
        STANDARD_AUDITION_PHRASES.en
      );

      expect(sample.success).toBe(true);
      expect(sample.voiceId).toBe(testVoice.id);
      expect(sample.byteLength).toBeGreaterThan(44);
      expect(fs.existsSync(sample.filePath)).toBe(true);
    });

    it('should run audition report and recommend voices based on warmth score', async () => {
      const report = await runVoiceAudition({
        manager: mockManager,
        outputDirectory: auditionTempDir,
        languages: ['en', 'ur', 'ar'],
      });

      expect(report.totalCandidates).toBeGreaterThanOrEqual(3);
      expect(report.samplesGenerated).toBe(report.totalCandidates);
      expect(report.recommendedVoices.en).toBeDefined();
      expect(report.recommendedVoices.ur).toBeDefined();
      expect(report.recommendedVoices.ar).toBeDefined();
      expect(fs.existsSync(auditionTempDir)).toBe(true);
    });
  });

  describe('2. CLI Argument Parsing', () => {
    it('should parse command-line flags accurately', () => {
      const args1 = ['--audition', '--json'];
      const opt1 = parseCliArgs(args1);
      expect(opt1.audition).toBe(true);
      expect(opt1.json).toBe(true);

      const args2 = ['--set-en', 'en-US-JennyNeural', '--set-ur', 'ur-PK-UzmaNeural'];
      const opt2 = parseCliArgs(args2);
      expect(opt2.setEn).toBe('en-US-JennyNeural');
      expect(opt2.setUr).toBe('ur-PK-UzmaNeural');

      const args3 = ['--list', '--reset'];
      const opt3 = parseCliArgs(args3);
      expect(opt3.list).toBe(true);
      expect(opt3.reset).toBe(true);
    });
  });

  describe('3. ToolRegistry Integration (Voice Mapping & Audition Tools)', () => {
    let registry: ToolRegistry;
    let mockContext: AgentContext;

    beforeEach(() => {
      registry = new ToolRegistry();
      const sttManager = new STTProviderManager();
      const voiceTools = createVoiceTools(sttManager, mockManager);
      for (const t of voiceTools) {
        registry.register(t);
      }

      mockContext = {
        sessionId: 'test-audition-session',
        taskId: 'task-audition-1401',
        currentTurn: 1,
        riskTierApproved: 'R1',
      };
    });

    it('should execute voice.get_voice_mapping and return active configuration', async () => {
      const result = await registry.execute('voice.get_voice_mapping', {}, mockContext);
      expect(result.success).toBe(true);
      expect(result.action).toBe('voice.get_voice_mapping');
      expect(result.riskLevel).toBe('R0');
      expect(result.data.en).toBeDefined();
      expect(result.data.ur).toBeDefined();
      expect(result.data.ar).toBeDefined();
    });

    it('should execute voice.set_voice_mapping [R1] and update preferred voice', async () => {
      const result = await registry.execute(
        'voice.set_voice_mapping',
        {
          en: 'en-US-JennyNeural',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('voice.set_voice_mapping');
      expect(result.riskLevel).toBe('R1');
      expect(result.data.en).toBe('en-US-JennyNeural');
      expect(result.evidence.en).toBe('en-US-JennyNeural');
    });

    it('should execute voice.audition_voices and return audition evidence', async () => {
      const result = await registry.execute(
        'voice.audition_voices',
        {
          languages: ['en'],
          outputDirectory: auditionTempDir,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('voice.audition_voices');
      expect(result.data.totalCandidates).toBeGreaterThan(0);
      expect(result.evidence.samplesGenerated).toBeGreaterThan(0);
      expect(result.evidence.recommendedVoices.en).toBeDefined();
    });
  });
});
