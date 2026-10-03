import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  detectLanguage,
  VoiceActivityDetector,
  MockSTTProvider,
  STTProviderManager,
  createVoiceTools,
} from '../../src/voice/index.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { createWavBuffer, createSilencePcm, createSpeechPcm } from './helpers.js';

const TEST_AUDIO_DIR = path.resolve(process.cwd(), 'temp', 'test_audio_' + Date.now());

function cleanupTestDir() {
  if (fs.existsSync(TEST_AUDIO_DIR)) {
    fs.rmSync(TEST_AUDIO_DIR, { recursive: true, force: true });
  }
}

describe('Phase 12: Multilingual Speech-To-Text & Language Identification', () => {
  beforeEach(() => {
    cleanupTestDir();
    fs.mkdirSync(TEST_AUDIO_DIR, { recursive: true });
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('1. Multilingual Language Identification & Code-Switching Detection', () => {
    it('should accurately identify pure English speech', () => {
      const text = 'Please open Google Chrome and search for machine learning tutorials';
      const result = detectLanguage(text);

      expect(result.language).toBe('en');
      expect(result.isCodeSwitched).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.details.hasLatin).toBe(true);
      expect(result.details.hasArabicScript).toBe(false);
    });

    it('should accurately identify pure Urdu script', () => {
      const text = 'براؤزر کھولیں اور تازہ ترین خبریں دکھائیں';
      const result = detectLanguage(text);

      expect(result.language).toBe('ur');
      expect(result.isCodeSwitched).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.details.hasUrduScript).toBe(true);
    });

    it('should accurately identify pure Arabic script', () => {
      const text = 'افتح المتصفح واذهب إلى موقع الأخبار العالمية';
      const result = detectLanguage(text);

      expect(result.language).toBe('ar');
      expect(result.isCodeSwitched).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.details.hasArabicScript).toBe(true);
    });

    it('should detect code-switching in Romanized Urdu with English technical verbs', () => {
      const text = 'Google par search karo aur latest report download karo';
      const result = detectLanguage(text);

      expect(result.isCodeSwitched).toBe(true);
      expect(result.language).toBe('mixed');
      expect(result.detectedPhrases.some((p) => p.language === 'ur')).toBe(true);
      expect(result.detectedPhrases.some((p) => p.language === 'en')).toBe(true);
    });

    it('should detect code-switching in bilingual Arabic script + Latin terms', () => {
      const text = 'ابحث في Google وقم بتنزيل الـ report';
      const result = detectLanguage(text);

      expect(result.isCodeSwitched).toBe(true);
      expect(result.language).toBe('mixed');
      expect(result.details.hasArabicScript).toBe(true);
      expect(result.details.hasLatin).toBe(true);
    });
  });

  describe('2. Voice Activity Detection (VAD) Engine', () => {
    it('should calculate frame energy and detect silence vs speech', () => {
      const vad = new VoiceActivityDetector({ energyThreshold: 0.02 });

      const silenceFrame = createSilencePcm(32); // 32ms silence frame
      const speechFrame = createSpeechPcm(32, 16000, 0.4); // 32ms loud frame

      const silenceResult = vad.processFrame(silenceFrame);
      expect(silenceResult.isVoice).toBe(false);
      expect(silenceResult.rms).toBe(0);

      const speechResult = vad.processFrame(speechFrame);
      expect(speechResult.isVoice).toBe(true);
      expect(speechResult.rms).toBeGreaterThan(0.02);
    });

    it('should trigger state transitions and emit speech_end upon silence hangover', async () => {
      const vad = new VoiceActivityDetector({
        minSpeechFrames: 2,
        silenceHangoverFrames: 3,
        energyThreshold: 0.02,
      });

      let speechStarted = false;
      let completedAudioLength = 0;

      vad.on('speech_start', () => {
        speechStarted = true;
      });

      vad.on('speech_end', (event) => {
        completedAudioLength = event.audioBuffer.length;
      });

      const speechFrame = createSpeechPcm(32, 16000, 0.5);
      const silenceFrame = createSilencePcm(32, 16000);

      // Feed 2 speech frames to trigger speech start
      vad.processFrame(speechFrame);
      vad.processFrame(speechFrame);
      expect(speechStarted).toBe(true);
      expect(vad.getState()).toBe('SPEECH_START');

      // Feed third speech frame to transition to ongoing speech
      vad.processFrame(speechFrame);
      expect(vad.getState()).toBe('SPEECH_ONGOING');

      // Feed 3 silence frames to trigger silence hangover cutoff
      vad.processFrame(silenceFrame);
      vad.processFrame(silenceFrame);
      vad.processFrame(silenceFrame);

      expect(completedAudioLength).toBeGreaterThan(0);
      expect(vad.getState()).toBe('SILENCE'); // Reset after speech_end
    });
  });

  describe('3. STTProviderManager & Multilingual Transcriptions', () => {
    it('should transcribe WAV audio buffer with language detection', async () => {
      const mockProvider = new MockSTTProvider({
        defaultText: 'Google par search karo aur summary batao',
      });
      const manager = new STTProviderManager({ providers: [mockProvider] });

      const wavBuffer = createWavBuffer(1.0);
      const result = await manager.transcribeBuffer(wavBuffer, 'wav');

      expect(result.text).toBe('Google par search karo aur summary batao');
      expect(result.isCodeSwitched).toBe(true);
      expect(result.language).toBe('mixed');
      expect(result.provider).toBe('mock-stt');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should transcribe audio file on disk', async () => {
      const testFilePath = path.join(TEST_AUDIO_DIR, 'sample.wav');
      const wavBuffer = createWavBuffer(1.0);
      fs.writeFileSync(testFilePath, wavBuffer);

      const mockProvider = new MockSTTProvider({
        defaultText: 'Please download the financial report',
      });
      const manager = new STTProviderManager({ providers: [mockProvider] });

      const result = await manager.transcribeFile(testFilePath);
      expect(result.text).toBe('Please download the financial report');
      expect(result.language).toBe('en');
    });

    it('should gracefully failover when primary STT provider is unavailable', async () => {
      const failingProvider = new MockSTTProvider({
        id: 'failing-provider',
        name: 'Faulty Cloud STT',
        isAvailable: false,
      });

      const fallbackProvider = new MockSTTProvider({
        id: 'fallback-provider',
        name: 'Reliable Fallback STT',
        isAvailable: true,
        defaultText: 'Fallback transcription succeeded',
      });

      const manager = new STTProviderManager({
        providers: [failingProvider, fallbackProvider],
      });

      const wavBuffer = createWavBuffer(0.5);
      const result = await manager.transcribeBuffer(wavBuffer);

      expect(result.text).toBe('Fallback transcription succeeded');
      expect(result.provider).toBe('fallback-provider');
    });
  });

  describe('4. ToolRegistry Voice Tool Envelopes', () => {
    it('should execute voice.transcribe_audio tool with base64 audio payload', async () => {
      const mockProvider = new MockSTTProvider({
        defaultText: 'افتح المتصفح واذهب إلى موقع الأخبار',
      });
      const manager = new STTProviderManager({ providers: [mockProvider] });

      const registry = new ToolRegistry();
      const tools = createVoiceTools(manager);
      for (const tool of tools) {
        registry.register(tool);
      }

      const wavBuffer = createWavBuffer(0.5);
      const base64Audio = wavBuffer.toString('base64');

      const result = await registry.execute('voice.transcribe_audio', {
        audioBase64: base64Audio,
      });

      expect(result.success).toBe(true);
      expect(result.riskLevel).toBe('R0');
      expect(result.data.text).toBe('افتح المتصفح واذهب إلى موقع الأخبار');
      expect(result.data.language).toBe('ar');
    });

    it('should execute voice.detect_language tool and classify input text', async () => {
      const manager = new STTProviderManager();
      const registry = new ToolRegistry();
      const tools = createVoiceTools(manager);
      for (const tool of tools) {
        registry.register(tool);
      }

      const result = await registry.execute('voice.detect_language', {
        text: 'براؤزر کھولیں اور تازہ ترین خبریں دکھائیں',
      });

      expect(result.success).toBe(true);
      expect(result.riskLevel).toBe('R0');
      expect(result.data.language).toBe('ur');
      expect(result.data.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });
});
