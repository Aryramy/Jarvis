import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';
import type { FileManager } from './manager.js';

export function createFileTools(fileManager: FileManager): ToolDefinition[] {
  const downloadTool: ToolDefinition = {
    name: 'file.download',
    description: 'Triggers a file download on the active page (e.g. by clicking a download link/button) and saves it with disk verification.',
    riskLevel: 'R1',
    inputSchema: z.object({
      triggerTarget: z.string().describe('The link, button text, or selector that initiates the download'),
      customFilename: z.string().optional().describe('Optional custom filename to save the downloaded file as'),
      timeoutMs: z.number().optional().describe('Maximum milliseconds to wait for download to finish (default: 30000)'),
    }),
    execute: async (input) => {
      try {
        const result = await fileManager.downloadByTrigger(input.triggerTarget, {
          customFilename: input.customFilename,
          timeoutMs: input.timeoutMs,
        });
        return {
          success: result.verified,
          action: 'file.download',
          target: input.triggerTarget,
          data: result,
          evidence: result.evidence,
          riskLevel: 'R1',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'file.download',
          target: input.triggerTarget,
          error: `Download failed: ${errorMsg}`,
          riskLevel: 'R1',
        };
      }
    },
  };

  const uploadTool: ToolDefinition = {
    name: 'file.upload',
    description: 'Uploads a local file from disk into a form file input on the active browser page with DOM verification.',
    riskLevel: 'R1',
    inputSchema: z.object({
      targetInput: z.string().describe('The label, name, or selector of the file input element'),
      filePath: z.string().describe('Absolute or relative path to the local file to upload'),
    }),
    execute: async (input) => {
      try {
        const result = await fileManager.uploadFile(input.targetInput, input.filePath);
        return {
          success: result.verified,
          action: 'file.upload',
          target: input.targetInput,
          data: result,
          evidence: result.evidence,
          riskLevel: 'R1',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'file.upload',
          target: input.targetInput,
          error: `Upload failed: ${errorMsg}`,
          riskLevel: 'R1',
        };
      }
    },
  };

  const verifyTool: ToolDefinition = {
    name: 'file.verify',
    description: 'Verifies whether a file exists on disk, returning size in bytes, SHA256 checksum, and modification timestamp.',
    riskLevel: 'R0',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the file on disk to verify'),
    }),
    execute: async (input) => {
      try {
        const metadata = await fileManager.verifyFileOnDisk(input.filePath);
        return {
          success: metadata.exists,
          action: 'file.verify',
          target: input.filePath,
          data: metadata,
          evidence: {
            exists: metadata.exists,
            sizeBytes: metadata.sizeBytes,
            sha256: metadata.sha256,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'file.verify',
          target: input.filePath,
          error: `File verification failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  return [downloadTool, uploadTool, verifyTool];
}
