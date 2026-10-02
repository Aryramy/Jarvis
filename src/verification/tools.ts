import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';
import type { VerificationService } from './service.js';

export function createVerificationTools(verificationService: VerificationService): ToolDefinition[] {
  const inspectStateTool: ToolDefinition = {
    name: 'verification.inspect_state',
    description: 'Captures a complete state snapshot of the browser, active DOM element, or local file for verification.',
    riskLevel: 'R0',
    inputSchema: z.object({
      targetElement: z.string().optional().describe('Optional CSS selector of an element to inspect'),
      filePath: z.string().optional().describe('Optional file path on disk to inspect'),
    }),
    execute: async (input) => {
      try {
        const snapshot = await verificationService.captureSnapshot({
          includeElement: input.targetElement,
          includeFile: input.filePath,
        });

        const handoff = verificationService.checkSensitiveHandoff(snapshot);

        return {
          success: true,
          action: 'verification.inspect_state',
          data: {
            snapshot,
            sensitiveHandoff: handoff,
          },
          evidence: {
            timestamp: snapshot.timestamp,
            hasBrowser: !!snapshot.browser,
            hasElement: !!snapshot.element,
            hasFile: !!snapshot.file,
            sensitiveBarrierDetected: handoff.detected,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'verification.inspect_state',
          error: `Snapshot capture failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const assertConditionTool: ToolDefinition = {
    name: 'verification.assert',
    description: 'Verifies an expected condition on the active browser or filesystem (e.g. TEXT_PRESENT, URL_CONTAINS, ELEMENT_VISIBLE, FILE_EXISTS_ON_DISK).',
    riskLevel: 'R0',
    inputSchema: z.object({
      assertionType: z.enum([
        'URL_CHANGED',
        'URL_CONTAINS',
        'URL_EQUALS',
        'TITLE_CONTAINS',
        'ELEMENT_VISIBLE',
        'ELEMENT_HIDDEN',
        'TEXT_PRESENT',
        'TEXT_ABSENT',
        'VALUE_EQUALS',
        'FILE_EXISTS_ON_DISK',
        'STATE_MUTATED',
      ]),
      expected: z.union([z.string(), z.boolean(), z.number()]).optional().describe('Expected value or text'),
      target: z.string().optional().describe('Target element selector, filename, or token'),
    }),
    execute: async (input) => {
      try {
        const preSnapshot = await verificationService.captureSnapshot({
          includeElement: input.target,
          includeFile: input.assertionType === 'FILE_EXISTS_ON_DISK' ? input.target : undefined,
        });

        const report = await verificationService.verify(preSnapshot, preSnapshot, [
          {
            type: input.assertionType,
            expected: input.expected,
            target: input.target,
          },
        ]);

        return {
          success: report.verified,
          action: 'verification.assert',
          target: input.target ?? input.assertionType,
          data: report,
          evidence: report.evidence,
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'verification.assert',
          error: `Assertion execution failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  return [inspectStateTool, assertConditionTool];
}
