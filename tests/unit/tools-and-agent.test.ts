import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../src/tools/index.js';
import { BaseAgent } from '../../src/agents/index.js';
import type { ToolResult, AgentContext } from '../../src/tools/types.js';
import type { AgentRunResult } from '../../src/agents/types.js';

describe('ToolRegistry & Structured Result Envelopes', () => {
  it('should register and execute a tool with valid inputs and structured evidence', async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: 'calculate_sum',
      description: 'Adds two numbers together',
      riskLevel: 'R0',
      inputSchema: z.object({
        a: z.number().describe('First number'),
        b: z.number().describe('Second number'),
      }),
      execute: async (input) => {
        return {
          success: true,
          action: 'calculate_sum',
          data: input.a + input.b,
          evidence: {
            computation: `${input.a} + ${input.b} = ${input.a + input.b}`,
          },
          riskLevel: 'R0',
        };
      },
    });

    const result = await registry.execute('calculate_sum', { a: 10, b: 25 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(35);
    expect(result.riskLevel).toBe('R0');
    expect(result.evidence?.computation).toBe('10 + 25 = 35');
  });

  it('should reject invalid input schemas with descriptive errors', async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: 'send_message',
      description: 'Sends a message to an email',
      riskLevel: 'R2',
      inputSchema: z.object({
        email: z.string().email(),
        message: z.string().min(1),
      }),
      execute: async () => ({
        success: true,
        action: 'send_message',
        riskLevel: 'R2',
      }),
    });

    const invalidResult = await registry.execute('send_message', {
      email: 'not-an-email',
      message: '',
    });

    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toContain('Invalid input parameters');
    expect(invalidResult.riskLevel).toBe('R2');
  });

  it('should convert registered tools into OpenAI-compatible JSON function definitions', () => {
    const registry = new ToolRegistry();

    registry.register({
      name: 'search_web',
      description: 'Searches the web for given query',
      riskLevel: 'R0',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        limit: z.number().optional().describe('Maximum number of results'),
      }),
      execute: async () => ({ success: true, action: 'search_web', riskLevel: 'R0' }),
    });

    const aiTools = registry.formatForAi();
    expect(aiTools).toHaveLength(1);
    expect(aiTools[0].type).toBe('function');
    expect(aiTools[0].function.name).toBe('search_web');
    expect(aiTools[0].function.description).toBe('Searches the web for given query');
    
    const params = aiTools[0].function.parameters as any;
    expect(params.type).toBe('object');
    expect(params.properties.query.type).toBe('string');
    expect(params.properties.query.description).toBe('The search query');
    expect(params.required).toContain('query');
    expect(params.required).not.toContain('limit');
  });
});

describe('BaseAgent Lifecycle & Observe-Decide-Act-Verify', () => {
  class TestAssistantAgent extends BaseAgent {
    async observe(context: AgentContext): Promise<string> {
      return `Current environment ready for session ${context.sessionId}`;
    }

    async decide(observation: unknown, _context: AgentContext): Promise<string> {
      return `Decided to compute sum based on: ${observation}`;
    }

    async verify(actionResult: ToolResult, _context: AgentContext): Promise<boolean> {
      return actionResult.success && actionResult.data === 100;
    }

    async run(instruction: string, context: AgentContext = {}): Promise<AgentRunResult> {
      const observation = await this.observe(context);
      await this.decide(observation, context);

      const actionResult = await this.act('add', { a: 40, b: 60 }, context);
      const verified = await this.verify(actionResult, context);

      return {
        success: verified,
        output: actionResult.data,
        speechResponse: 'Calculation complete and verified.',
        displayResponse: `## Calculation Report\nResult: ${actionResult.data}`,
        stepsExecuted: 1,
      };
    }
  }

  it('should execute full Observe-Decide-Act-Verify agent lifecycle', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'add',
      description: 'Add numbers',
      riskLevel: 'R0',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async (input) => ({
        success: true,
        action: 'add',
        data: input.a + input.b,
        evidence: { sum: input.a + input.b },
        riskLevel: 'R0',
      }),
    });

    const agent = new TestAssistantAgent({
      name: 'MathSpecialist',
      role: 'Computation',
      systemPrompt: 'You compute mathematical results.',
      tools: registry,
    });

    const actSpy = vi.fn();
    agent.on('act', actSpy);

    const result = await agent.run('Add 40 and 60', { sessionId: 'sess-001' });

    expect(result.success).toBe(true);
    expect(result.output).toBe(100);
    expect(result.speechResponse).toBe('Calculation complete and verified.');
    expect(result.displayResponse).toContain('## Calculation Report');
    expect(actSpy).toHaveBeenCalledWith({ action: 'add', input: { a: 40, b: 60 } });
  });
});
