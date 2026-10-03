import { z } from 'zod';
import type { ToolDefinition, ToolResult, AgentContext } from '../tools/types.js';
import type { STTProviderManager } from './provider-manager.js';
import { TTSProviderManager } from './tts-manager.js';
import { detectLanguage } from './lang-detector.js';
import { runTTSBenchmark } from './benchmark.js';
import { synthesizeSpeechInputSchema, benchmarkTTSInputSchema } from './tts-types.js';

export function createVoiceTools(
  sttManager: STTProviderManager,
  ttsManager: TTSProviderManager = new TTSProviderManager()
): ToolDefinition[] {
  return [
    {
      name: 'voice.transcribe_audio',
      description: 'Transcribes audio to text supporting English, Urdu, Arabic, and mixed code-switching with language detection.',
      riskLevel: 'R0',
      inputSchema: z.object({
        audioBase64: z.string().optional(),
        filePath: z.string().optional(),
        languageHint: z.enum(['en', 'ur', 'ar', 'auto']).optional(),
        prompt: z.string().optional(),
      }),
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          let buffer: Buffer;
          let filePath: string | undefined;

          if (input.filePath) {
            filePath = input.filePath;
            const res = await sttManager.transcribeFile(input.filePath, {
              languageHint: input.languageHint,
              prompt: input.prompt,
            });
            return {
              success: true,
              action: 'voice.transcribe_audio',
              target: filePath,
              data: res,
              evidence: {
                text: res.text,
                language: res.language,
                confidence: res.confidence,
                provider: res.provider,
              },
              riskLevel: 'R0',
            };
          } else if (input.audioBase64) {
            buffer = Buffer.from(input.audioBase64, 'base64');
            const res = await sttManager.transcribeBuffer(buffer, 'wav', {
              languageHint: input.languageHint,
              prompt: input.prompt,
            });
            return {
              success: true,
              action: 'voice.transcribe_audio',
              data: res,
              evidence: {
                text: res.text,
                language: res.language,
                confidence: res.confidence,
                provider: res.provider,
              },
              riskLevel: 'R0',
            };
          } else {
            return {
              success: false,
              action: 'voice.transcribe_audio',
              error: 'Either audioBase64 or filePath must be provided for audio transcription.',
              riskLevel: 'R0',
            };
          }
        } catch (error) {
          return {
            success: false,
            action: 'voice.transcribe_audio',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'voice.detect_language',
      description: 'Identifies language (en, ur, ar, mixed) and code-switching patterns in natural text or transcripts.',
      riskLevel: 'R0',
      inputSchema: z.object({
        text: z.string().min(1),
        hint: z.string().optional(),
      }),
      execute: async (input: { text: string; hint?: string }, _context: AgentContext): Promise<ToolResult> => {
        try {
          const result = detectLanguage(input.text, input.hint);
          return {
            success: true,
            action: 'voice.detect_language',
            data: result,
            evidence: {
              language: result.language,
              confidence: result.confidence,
              isCodeSwitched: result.isCodeSwitched,
            },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'voice.detect_language',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'voice.synthesize_speech',
      description: 'Synthesizes text to speech using trilingual TTS providers (Edge Neural, Windows SAPI, Mock) with automatic fallback.',
      riskLevel: 'R0',
      inputSchema: synthesizeSpeechInputSchema,
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          if (input.outputFilePath) {
            const res = await ttsManager.synthesizeToFile(input.text, input.outputFilePath, {
              language: input.language,
              voice: input.voice,
              format: input.format,
            });
            return {
              success: true,
              action: 'voice.synthesize_speech',
              target: res.filePath,
              data: {
                provider: res.provider,
                voice: res.voice,
                language: res.language,
                latencyMs: res.latencyMs,
                byteLength: res.byteLength,
                filePath: res.filePath,
              },
              evidence: {
                provider: res.provider,
                voice: res.voice,
                byteLength: res.byteLength,
                latencyMs: res.latencyMs,
              },
              riskLevel: 'R0',
            };
          } else {
            const res = await ttsManager.synthesize(input.text, {
              language: input.language,
              voice: input.voice,
              format: input.format,
            });
            return {
              success: true,
              action: 'voice.synthesize_speech',
              data: {
                provider: res.provider,
                voice: res.voice,
                language: res.language,
                latencyMs: res.latencyMs,
                byteLength: res.byteLength,
                audioBase64: res.audioBuffer.toString('base64'),
              },
              evidence: {
                provider: res.provider,
                voice: res.voice,
                byteLength: res.byteLength,
                latencyMs: res.latencyMs,
              },
              riskLevel: 'R0',
            };
          }
        } catch (error) {
          return {
            success: false,
            action: 'voice.synthesize_speech',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'voice.benchmark_tts',
      description: 'Runs multi-provider benchmark evaluating warmth, latency, and pronunciation across English, Urdu, and Arabic phrases.',
      riskLevel: 'R0',
      inputSchema: benchmarkTTSInputSchema,
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const report = await runTTSBenchmark({
            manager: ttsManager,
            languages: input.languages,
            outputDirectory: input.outputDirectory,
          });
          return {
            success: true,
            action: 'voice.benchmark_tts',
            data: report,
            evidence: {
              totalSamples: report.totalSamples,
              successfulSamples: report.successfulSamples,
              failedSamples: report.failedSamples,
              averageLatencyMs: report.averageLatencyMs,
              outputDirectory: report.outputDirectory,
            },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'voice.benchmark_tts',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'voice.get_voice_mapping',
      description: 'Returns the current active preferred voice configuration for English, Urdu, Arabic, and Mixed.',
      riskLevel: 'R0',
      inputSchema: z.object({}),
      execute: async (_input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const { loadVoiceConfig } = await import('./voice-config.js');
          const config = await loadVoiceConfig();
          return {
            success: true,
            action: 'voice.get_voice_mapping',
            data: config,
            evidence: {
              en: config.en,
              ur: config.ur,
              ar: config.ar,
              mixed: config.mixed,
            },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'voice.get_voice_mapping',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'voice.set_voice_mapping',
      description: 'Updates and saves preferred voice mapping across English, Urdu, Arabic, or Mixed.',
      riskLevel: 'R1',
      inputSchema: z.object({
        en: z.string().optional(),
        ur: z.string().optional(),
        ar: z.string().optional(),
        mixed: z.string().optional(),
      }),
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const { saveVoiceConfig } = await import('./voice-config.js');
          const updated = await saveVoiceConfig(input);
          await ttsManager.syncVoiceConfig();
          return {
            success: true,
            action: 'voice.set_voice_mapping',
            data: updated,
            evidence: {
              en: updated.en,
              ur: updated.ur,
              ar: updated.ar,
              mixed: updated.mixed,
            },
            riskLevel: 'R1',
          };
        } catch (error) {
          return {
            success: false,
            action: 'voice.set_voice_mapping',
            error: (error as Error).message,
            riskLevel: 'R1',
          };
        }
      },
    },
    {
      name: 'voice.audition_voices',
      description: 'Generates standardized listening audition samples for candidate voices and returns evaluation report.',
      riskLevel: 'R0',
      inputSchema: z.object({
        languages: z.array(z.enum(['en', 'ur', 'ar', 'mixed'])).optional(),
        outputDirectory: z.string().optional(),
      }),
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const { runVoiceAudition } = await import('./audition.js');
          const report = await runVoiceAudition({
            manager: ttsManager,
            languages: input.languages,
            outputDirectory: input.outputDirectory,
          });
          return {
            success: true,
            action: 'voice.audition_voices',
            data: report,
            evidence: {
              totalCandidates: report.totalCandidates,
              samplesGenerated: report.samplesGenerated,
              outputDirectory: report.outputDirectory,
              recommendedVoices: report.recommendedVoices,
            },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'voice.audition_voices',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
  ];
}
