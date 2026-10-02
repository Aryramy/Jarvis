import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';
import type { FormInspector } from './inspector.js';
import { FormAgent } from './agent.js';

export function createFormTools(
  inspectorOrAgent: FormInspector | FormAgent,
  agentOption?: FormAgent
): ToolDefinition[] {
  let inspector: FormInspector;
  let agent: FormAgent | undefined;

  if (inspectorOrAgent instanceof FormAgent) {
    agent = inspectorOrAgent;
    inspector = agent.getInspector();
  } else {
    inspector = inspectorOrAgent;
    agent = agentOption;
  }

  const inspectFormTool: ToolDefinition = {
    name: 'form.inspect',
    description: 'Inspects and analyzes web forms on the active page to discover fields, labels, types, required attributes, options, and submit buttons.',
    riskLevel: 'R0',
    inputSchema: z.object({
      formSelector: z.string().optional().describe('Optional CSS selector to scope inspection to a specific form'),
    }),
    execute: async (input) => {
      try {
        const result = await inspector.inspect(input.formSelector);
        return {
          success: true,
          action: 'form.inspect',
          target: result.url,
          data: result,
          evidence: {
            url: result.url,
            formsCount: result.formsCount,
            totalFieldsCount: result.totalFieldsCount,
            requiredFieldsCount: result.evidence.requiredFieldsCount,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'form.inspect',
          error: `Form inspection failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const tools: ToolDefinition[] = [inspectFormTool];

  if (agent) {
    const fillDraftTool: ToolDefinition = {
      name: 'form.fill_draft',
      description: 'Populates draft field values in a web form (R1 risk). Does NOT submit the form.',
      riskLevel: 'R1',
      inputSchema: z.object({
        formData: z.record(z.union([z.string(), z.boolean(), z.number()])).describe('Key-value pairs of field names/labels and values to enter'),
        formSelector: z.string().optional().describe('Optional CSS selector to target a specific form'),
      }),
      execute: async (input) => {
        try {
          const result = await agent!.fillDraft(input.formData, input.formSelector);
          return {
            success: result.filledFields.some((f) => f.success),
            action: 'form.fill_draft',
            target: result.formId,
            data: result,
            evidence: result.evidence,
            riskLevel: 'R1',
          };
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            action: 'form.fill_draft',
            error: `Draft filling failed: ${errorMsg}`,
            riskLevel: 'R1',
          };
        }
      },
    };

    const submitTool: ToolDefinition = {
      name: 'form.submit',
      description: 'Submits a form with mandatory authorization gating (R2 risk). Fails if authorization is not explicitly confirmed.',
      riskLevel: 'R2',
      inputSchema: z.object({
        authorizeSubmit: z.boolean().describe('Explicit confirmation from the user to execute form submission'),
        formSelector: z.string().optional().describe('Optional CSS selector for the form to submit'),
        buttonText: z.string().optional().describe('Optional label of the submit button to click'),
      }),
      execute: async (input) => {
        try {
          const result = await agent!.submit(input.authorizeSubmit, {
            formSelector: input.formSelector,
            buttonText: input.buttonText,
          });
          return {
            success: result.submitted,
            action: 'form.submit',
            target: result.formId,
            data: result,
            evidence: result.evidence,
            riskLevel: 'R2',
          };
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            action: 'form.submit',
            error: `Submission failed: ${errorMsg}`,
            riskLevel: 'R2',
          };
        }
      },
    };

    tools.push(fillDraftTool, submitTool);
  }

  return tools;
}
