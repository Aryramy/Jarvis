import { z } from 'zod';
import type { ToolDefinition, ToolResult, AgentContext } from '../tools/types.js';
import type { STTProviderManager } from './provider-manager.js';
import { detectLanguage } from './lang-detector.js';

export function createVoiceTools(sttManager: STTProviderManager): ToolDefinition[] {
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
  ];
}
