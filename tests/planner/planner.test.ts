import { describe, it, expect } from 'vitest';
import { PlannerAgent } from '../../src/planner/agent.js';
import type { PlanStep } from '../../src/planner/types.js';

describe('PlannerAgent & DAG Step Decomposition (TASK-1001)', () => {
  const planner = new PlannerAgent();

  it('should decompose search and download instructions into a sequential DAG', async () => {
    const plan = await planner.generatePlan('search for typescript handbook and download pdf');

    expect(plan.id).toBeDefined();
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);

    // Verify sequential dependencies
    const step1 = plan.steps.find((s) => s.id === 'step-1');
    const step2 = plan.steps.find((s) => s.id === 'step-2');
    const step3 = plan.steps.find((s) => s.id === 'step-3');

    expect(step1).toBeDefined();
    expect(step1?.toolName).toBe('web.search');
    expect(step1?.dependencies).toEqual([]);

    expect(step2).toBeDefined();
    expect(step2?.dependencies).toContain('step-1');

    expect(step3).toBeDefined();
    expect(step3?.dependencies).toContain('step-2');

    // Dual summaries
    expect(plan.speechSummary).toBeDefined();
    expect(typeof plan.speechSummary).toBe('string');
    expect(plan.displaySummary).toContain('### Execution Plan');
  });

  it('should detect cycles and throw descriptive error if circular dependencies exist', () => {
    const circularSteps: PlanStep[] = [
      {
        id: 'step-1',
        title: 'Step 1',
        toolName: 'web.search',
        input: {},
        dependencies: ['step-2'], // Circular!
        riskLevel: 'R0',
        expectedOutcome: '',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      },
      {
        id: 'step-2',
        title: 'Step 2',
        toolName: 'browser.open_url',
        input: {},
        dependencies: ['step-1'], // Circular!
        riskLevel: 'R0',
        expectedOutcome: '',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      },
    ];

    expect(() => planner.validateDAG(circularSteps)).toThrow(/Circular dependency cycle detected/);
  });

  it('should resolve next executable steps according to completed dependency state', async () => {
    const plan = await planner.generatePlan('search for nodejs news and summarize page');

    // Initially only step-1 has all dependencies met (0 dependencies)
    const initialSteps = planner.getNextExecutableSteps(plan);
    expect(initialSteps.length).toBe(1);
    expect(initialSteps[0].id).toBe('step-1');

    // Complete step-1
    plan.steps[0].status = 'COMPLETED';

    // Now step-2 should become executable
    const nextSteps = planner.getNextExecutableSteps(plan);
    expect(nextSteps.length).toBe(1);
    expect(nextSteps[0].id).toBe('step-2');
  });

  it('should handle replanOnFailure by marking downstream dependent steps as SKIPPED', async () => {
    const plan = await planner.generatePlan('search for documentation and download file');

    const replanned = planner.replanOnFailure(plan, 'step-2', 'Network connection refused');

    expect(replanned.status).toBe('FAILED');
    const step2 = replanned.steps.find((s) => s.id === 'step-2');
    expect(step2?.status).toBe('FAILED');
    expect(step2?.error).toBe('Network connection refused');

    // Step 3 depends on Step 2 -> must be SKIPPED
    const step3 = replanned.steps.find((s) => s.id === 'step-3');
    expect(step3?.status).toBe('SKIPPED');
    expect(step3?.error).toContain('Skipped because prerequisite step "step-2" failed');
  });

  it('should correctly decompose form filling with R1 draft and R2 submission', async () => {
    const plan = await planner.generatePlan('fill out form at https://example.com/apply and submit');

    const draftStep = plan.steps.find((s) => s.toolName === 'form.fill_draft');
    const submitStep = plan.steps.find((s) => s.toolName === 'form.submit');

    expect(draftStep).toBeDefined();
    expect(draftStep?.riskLevel).toBe('R1');

    expect(submitStep).toBeDefined();
    expect(submitStep?.riskLevel).toBe('R2');
    expect(submitStep?.dependencies).toContain(draftStep?.id);
  });
});
