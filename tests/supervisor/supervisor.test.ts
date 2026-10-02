import { describe, it, expect, vi } from 'vitest';
import { SupervisorAgent } from '../../src/supervisor/agent.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { z } from 'zod';

describe('SupervisorAgent Orchestrator (TASK-1002)', () => {
  it('should accurately classify user intent and language', () => {
    const supervisor = new SupervisorAgent();

    // 1. English Conversational
    const int1 = supervisor.parseIntent('Hello JARVIS, who are you?');
    expect(int1.intent).toBe('CONVERSATIONAL');
    expect(int1.language).toBe('en');

    // 2. Urdu Query
    const int2 = supervisor.parseIntent('Pakistan ke baray mein search karo');
    expect(int2.intent).toBe('SEARCH');
    expect(int2.language).toBe('ur');

    // 3. Arabic Greeting
    const int3 = supervisor.parseIntent('مرحبا كيف حالك');
    expect(int3.intent).toBe('CONVERSATIONAL');
    expect(int3.language).toBe('ar');

    // 4. Form Submission (R2)
    const int4 = supervisor.parseIntent('fill out form at https://test.org and submit');
    expect(int4.intent).toBe('FORM');
    expect(int4.suggestedRiskLevel).toBe('R2');
  });

  it('should deliver immediate conversational responses without invoking planner', async () => {
    const supervisor = new SupervisorAgent();

    const result = await supervisor.execute('Hello JARVIS');
    expect(result.status).toBe('COMPLETED');
    expect(result.parsedIntent.intent).toBe('CONVERSATIONAL');
    expect(result.completedSteps).toBe(0);
    expect(result.speechResponse).toContain('Hello, I am JARVIS');
    expect(result.displayResponse).toContain('JARVIS Assistant');
  });

  it('should execute autonomous R0/R1 steps and resolve dynamic inputs', async () => {
    const tools = new ToolRegistry();

    // Register mock tools
    tools.register({
      name: 'web.search',
      description: 'Search web',
      riskLevel: 'R0',
      schema: z.object({ query: z.string() }),
      execute: async ({ query }) => ({
        success: true,
        action: 'web.search',
        riskLevel: 'R0',
        evidence: {
          sources: [{ url: 'https://example.com/article', title: 'Top Result' }],
        },
      }),
    });

    tools.register({
      name: 'browser.open_url',
      description: 'Open URL',
      riskLevel: 'R0',
      schema: z.object({ url: z.string() }),
      execute: async ({ url }) => ({
        success: true,
        action: 'browser.open_url',
        riskLevel: 'R0',
        evidence: { openedUrl: url },
      }),
    });

    tools.register({
      name: 'browser.read_page',
      description: 'Read page text',
      riskLevel: 'R0',
      schema: z.object({ maxLength: z.number().optional() }),
      execute: async () => ({
        success: true,
        action: 'browser.read_page',
        riskLevel: 'R0',
        evidence: { text: 'Article content about Node.js' },
      }),
    });

    const supervisor = new SupervisorAgent({ tools });

    const stepStartSpy = vi.fn();
    const stepCompSpy = vi.fn();
    supervisor.on('step_start', stepStartSpy);
    supervisor.on('step_completed', stepCompSpy);

    const result = await supervisor.execute('search for nodejs news and summarize page');

    expect(result.status).toBe('COMPLETED');
    expect(result.completedSteps).toBe(3);
    expect(stepStartSpy).toHaveBeenCalledTimes(3);
    expect(stepCompSpy).toHaveBeenCalledTimes(3);

    // Verify dynamic input was resolved ($step-1.sources[0].url -> 'https://example.com/article')
    const openUrlLog = result.stepsLog.find((s) => s.toolName === 'browser.open_url');
    expect(openUrlLog).toBeDefined();
    expect(openUrlLog?.result?.evidence).toEqual({ openedUrl: 'https://example.com/article' });

    // Verify distinct dual output channels
    expect(result.speechResponse).not.toContain('|');
    expect(result.speechResponse).not.toContain('###');
    expect(result.displayResponse).toContain('# Task Execution Completed');
    expect(result.displayResponse).toContain('| Step | Tool |');
  });

  it('should halt and prompt for authorization when encountering an R2 action without permission', async () => {
    const tools = new ToolRegistry();

    tools.register({
      name: 'browser.open_url',
      description: 'Open URL',
      riskLevel: 'R0',
      schema: z.object({ url: z.string() }),
      execute: async () => ({ success: true, action: 'browser.open_url', riskLevel: 'R0', evidence: {} }),
    });

    tools.register({
      name: 'form.inspect',
      description: 'Inspect form',
      riskLevel: 'R0',
      schema: z.object({}),
      execute: async () => ({ success: true, action: 'form.inspect', riskLevel: 'R0', evidence: {} }),
    });

    tools.register({
      name: 'form.fill_draft',
      description: 'Fill draft',
      riskLevel: 'R1',
      schema: z.object({ values: z.record(z.unknown()) }),
      execute: async () => ({ success: true, action: 'form.fill_draft', riskLevel: 'R1', evidence: {} }),
    });

    tools.register({
      name: 'form.submit',
      description: 'Submit form',
      riskLevel: 'R2',
      schema: z.object({ authorizeSubmit: z.boolean().optional() }),
      execute: async () => ({ success: true, action: 'form.submit', riskLevel: 'R2', evidence: {} }),
    });

    const supervisor = new SupervisorAgent({ tools });

    // Execute WITHOUT authorization
    const result = await supervisor.execute('fill out form at https://example.com/job and submit');

    expect(result.status).toBe('WAITING_FOR_AUTHORIZATION');
    expect(result.authorizationPrompt).toBeDefined();
    expect(result.authorizationPrompt?.riskLevel).toBe('R2');
    expect(result.speechResponse).toContain('which has external effects under safety tier R2');
    expect(result.displayResponse).toContain('Authorization Required');

    // Verify that steps up to R1 completed
    expect(result.completedSteps).toBe(3);
    const submitStep = result.stepsLog.find((s) => s.toolName === 'form.submit');
    expect(submitStep?.status).toBe('WAITING_FOR_AUTHORIZATION');
  });

  it('should execute through R2 step when explicit authorization is provided in context', async () => {
    const tools = new ToolRegistry();

    tools.register({
      name: 'browser.open_url',
      description: 'Open URL',
      riskLevel: 'R0',
      schema: z.object({ url: z.string() }),
      execute: async () => ({ success: true, action: 'browser.open_url', riskLevel: 'R0', evidence: {} }),
    });

    tools.register({
      name: 'form.inspect',
      description: 'Inspect form',
      riskLevel: 'R0',
      schema: z.object({}),
      execute: async () => ({ success: true, action: 'form.inspect', riskLevel: 'R0', evidence: {} }),
    });

    tools.register({
      name: 'form.fill_draft',
      description: 'Fill draft',
      riskLevel: 'R1',
      schema: z.object({ values: z.record(z.unknown()) }),
      execute: async () => ({ success: true, action: 'form.fill_draft', riskLevel: 'R1', evidence: {} }),
    });

    tools.register({
      name: 'form.submit',
      description: 'Submit form',
      riskLevel: 'R2',
      schema: z.object({ authorizeSubmit: z.boolean().optional() }),
      execute: async () => ({ success: true, action: 'form.submit', riskLevel: 'R2', evidence: { submitted: true } }),
    });

    const supervisor = new SupervisorAgent({ tools });

    // Execute WITH explicit authorization
    const result = await supervisor.execute(
      'fill out form at https://example.com/job and submit',
      { authorizeSubmit: true }
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.completedSteps).toBe(4);
    const submitStep = result.stepsLog.find((s) => s.toolName === 'form.submit');
    expect(submitStep?.status).toBe('COMPLETED');
  });
});
