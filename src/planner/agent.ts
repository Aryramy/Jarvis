import { BaseAgent, type BaseAgentOptions } from '../agents/base.js';
import type { AgentContext, ToolResult } from '../tools/types.js';
import type { AgentRunResult } from '../agents/types.js';
import type {
  ExecutionPlan,
  PlanStep,
  PlanGenerationOptions,
} from './types.js';

export class PlannerAgent extends BaseAgent {
  constructor(options?: Partial<BaseAgentOptions>) {
    super({
      name: 'PlannerAgent',
      role: 'Dynamic Task Decomposer & DAG Planner',
      systemPrompt: `You are the PlannerAgent of JARVIS.
Your responsibility is to decompose complex user instructions into a directed acyclic graph (DAG) of actionable, verifiable steps.
Each step must specify:
- id: unique step identifier (step-1, step-2, etc.)
- title: concise title
- toolName: one of the registered tools (web.search, browser.open_url, browser.read_page, browser.click, browser.type, form.inspect, form.fill_draft, form.submit, file.download, file.upload, file.verify, verification.assert)
- input: JSON object of arguments
- dependencies: list of step IDs that must complete before this step
- riskLevel: R0 (read-only), R1 (low risk/reversible), R2 (external effect/submit), or R3 (high impact)
- expectedOutcome: verifiable description of what this step achieves
- verificationAssertions: optional array of declarative assertions (e.g. TEXT_PRESENT, URL_CONTAINS, ELEMENT_VISIBLE, FILE_EXISTS_ON_DISK)

CRITICAL RULES:
1. No circular dependencies. The graph must be an acyclic DAG.
2. Form submissions (form.submit) must ALWAYS be classified as R2.
3. Form drafts (form.fill_draft) must ALWAYS precede form.submit.
4. File downloads (file.download) must be followed by verification (file.verify or verification.assert with FILE_EXISTS_ON_DISK).
5. Output MUST be valid JSON only.`,
      tools: options?.tools,
      gateway: options?.gateway,
    });
  }

  async observe(_context: AgentContext): Promise<{ availableTools: string[] }> {
    const availableTools = this.tools.listTools().map((t) => t.name);
    return { availableTools };
  }

  async decide(observation: unknown, _context: AgentContext): Promise<unknown> {
    return observation;
  }

  async verify(actionResult: ToolResult, _context: AgentContext): Promise<boolean> {
    return actionResult.success;
  }

  /**
   * Generates a DAG ExecutionPlan from a high-level user goal.
   */
  async generatePlan(goal: string, options: PlanGenerationOptions = {}): Promise<ExecutionPlan> {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const availableTools = options.availableTools ?? this.tools.listTools().map((t) => t.name);

    let steps: PlanStep[] = [];

    // Attempt LLM generation if requested/enabled (default heuristic in test mode)
    const shouldAttemptLLM =
      options.useLLM === true ||
      (options.useLLM !== false && process.env.NODE_ENV !== 'test');

    if (shouldAttemptLLM) {
      try {
        steps = await this.generateStepsWithLLM(goal, availableTools, options);
      } catch {
        steps = this.generateStepsHeuristic(goal, availableTools);
      }
    } else {
      steps = this.generateStepsHeuristic(goal, availableTools);
    }

    if (!steps || steps.length === 0) {
      steps = this.generateStepsHeuristic(goal, availableTools);
    }

    // Validate and sanitize DAG
    this.validateDAG(steps);

    const speechSummary = this.formatPlanSpeechSummary(goal, steps);
    const displaySummary = this.formatPlanDisplaySummary(goal, steps);

    const plan: ExecutionPlan = {
      id: planId,
      goal,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'NOT_STARTED',
      speechSummary,
      displaySummary,
    };

    return plan;
  }

  /**
   * Generates steps via LLM completion.
   */
  private async generateStepsWithLLM(
    goal: string,
    availableTools: string[],
    _options: PlanGenerationOptions
  ): Promise<PlanStep[]> {
    const prompt = `Decompose this user instruction into an executable DAG plan:
Instruction: "${goal}"

Available Tools:
${availableTools.join(', ')}

Respond ONLY with a JSON array of step objects with this format:
[
  {
    "id": "step-1",
    "title": "Search for documentation",
    "toolName": "web.search",
    "input": { "query": "..." },
    "dependencies": [],
    "riskLevel": "R0",
    "expectedOutcome": "Search results obtained",
    "verificationAssertions": []
  }
]`;

    const response = await this.gateway.complete(prompt, {
      systemPrompt: this.systemPrompt,
      temperature: 0.1,
    });

    const cleaned = response.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('LLM did not return a valid array of plan steps');
    }

    return parsed.map((item, index) => ({
      id: item.id || `step-${index + 1}`,
      title: item.title || `Step ${index + 1}`,
      toolName: item.toolName || 'web.search',
      input: item.input || {},
      dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
      riskLevel: item.riskLevel || 'R0',
      expectedOutcome: item.expectedOutcome || '',
      verificationAssertions: item.verificationAssertions || [],
      status: 'PENDING' as const,
      retryCount: 0,
      maxRetries: 3,
    }));
  }

  /**
   * Deterministic rule-based decomposition when LLM is unavailable or for deterministic workflows.
   */
  generateStepsHeuristic(goal: string, _availableTools: string[]): PlanStep[] {
    const lower = goal.toLowerCase();
    const steps: PlanStep[] = [];

    // Pattern 1: Search + Navigate/Read
    if (lower.includes('search') || lower.includes('find') || lower.includes('look up')) {
      const match = goal.match(/(?:search for|search|find|look up)\s+["']?([^"']+)["']?/i);
      const query = match && match[1] ? match[1].replace(/(?:and|then)\s+(?:download|open|visit|read).*/i, '').trim() : goal;

      steps.push({
        id: 'step-1',
        title: `Search web for: ${query}`,
        toolName: 'web.search',
        input: { query },
        dependencies: [],
        riskLevel: 'R0',
        expectedOutcome: 'Retrieved verified search results with destination URLs',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      });

      if (lower.includes('download') || lower.includes('save file')) {
        steps.push({
          id: 'step-2',
          title: 'Navigate to target result page',
          toolName: 'browser.open_url',
          input: { url: '$step-1.sources[0].url' },
          dependencies: ['step-1'],
          riskLevel: 'R0',
          expectedOutcome: 'Target page loaded in active browser tab',
          status: 'PENDING',
          retryCount: 0,
          maxRetries: 3,
        });

        steps.push({
          id: 'step-3',
          title: 'Download target file',
          toolName: 'file.download',
          input: { selector: 'a:has-text("Download")', triggerAction: 'click' },
          dependencies: ['step-2'],
          riskLevel: 'R1',
          expectedOutcome: 'File downloaded into downloads directory',
          status: 'PENDING',
          retryCount: 0,
          maxRetries: 3,
        });

        steps.push({
          id: 'step-4',
          title: 'Verify downloaded file on disk',
          toolName: 'file.verify',
          input: { filepath: '$step-3.filepath' },
          dependencies: ['step-3'],
          riskLevel: 'R0',
          expectedOutcome: 'File exists on disk with byte size > 0 and SHA256 checksum',
          verificationAssertions: [{ type: 'FILE_EXISTS_ON_DISK', target: '$step-3.filepath' }],
          status: 'PENDING',
          retryCount: 0,
          maxRetries: 3,
        });
      } else if (lower.includes('open') || lower.includes('read') || lower.includes('summarize')) {
        steps.push({
          id: 'step-2',
          title: 'Open top search result',
          toolName: 'browser.open_url',
          input: { url: '$step-1.sources[0].url' },
          dependencies: ['step-1'],
          riskLevel: 'R0',
          expectedOutcome: 'Webpage opened and loaded successfully',
          status: 'PENDING',
          retryCount: 0,
          maxRetries: 3,
        });

        steps.push({
          id: 'step-3',
          title: 'Read and extract page text',
          toolName: 'browser.read_page',
          input: { maxLength: 8000 },
          dependencies: ['step-2'],
          riskLevel: 'R0',
          expectedOutcome: 'Sanitized webpage content extracted',
          status: 'PENDING',
          retryCount: 0,
          maxRetries: 3,
        });
      }
    }
    // Pattern 2: Form Interaction
    else if (lower.includes('form') || lower.includes('fill') || lower.includes('submit')) {
      const urlMatch = goal.match(/https?:\/\/[^\s]+/i);
      const url = urlMatch ? urlMatch[0] : 'https://example.com/form';

      steps.push({
        id: 'step-1',
        title: `Navigate to form at ${url}`,
        toolName: 'browser.open_url',
        input: { url },
        dependencies: [],
        riskLevel: 'R0',
        expectedOutcome: 'Form webpage loaded',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      });

      steps.push({
        id: 'step-2',
        title: 'Inspect form fields and structure',
        toolName: 'form.inspect',
        input: {},
        dependencies: ['step-1'],
        riskLevel: 'R0',
        expectedOutcome: 'Form schema with field names, types, and constraints discovered',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      });

      steps.push({
        id: 'step-3',
        title: 'Draft fill form fields (R1 - Reversible)',
        toolName: 'form.fill_draft',
        input: { values: {} },
        dependencies: ['step-2'],
        riskLevel: 'R1',
        expectedOutcome: 'Draft inputs populated without submission',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      });

      if (lower.includes('submit')) {
        steps.push({
          id: 'step-4',
          title: 'Submit form (R2 - Requires User Authorization)',
          toolName: 'form.submit',
          input: { authorizeSubmit: false },
          dependencies: ['step-3'],
          riskLevel: 'R2',
          expectedOutcome: 'Form submitted following explicit user permission',
          verificationAssertions: [{ type: 'STATE_MUTATED' }],
          status: 'PENDING',
          retryCount: 0,
          maxRetries: 3,
        });
      }
    }
    // Pattern 3: Generic direct URL navigation
    else if (goal.match(/https?:\/\/[^\s]+/i)) {
      const url = goal.match(/https?:\/\/[^\s]+/i)![0];
      steps.push({
        id: 'step-1',
        title: `Navigate to ${url}`,
        toolName: 'browser.open_url',
        input: { url },
        dependencies: [],
        riskLevel: 'R0',
        expectedOutcome: 'Destination webpage loaded',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      });

      steps.push({
        id: 'step-2',
        title: 'Read webpage content',
        toolName: 'browser.read_page',
        input: { maxLength: 8000 },
        dependencies: ['step-1'],
        riskLevel: 'R0',
        expectedOutcome: 'Clean page text extracted',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      });
    }
    // Default fallback: Web Search
    else {
      steps.push({
        id: 'step-1',
        title: `Search information for: ${goal}`,
        toolName: 'web.search',
        input: { query: goal },
        dependencies: [],
        riskLevel: 'R0',
        expectedOutcome: 'Search results gathered',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
      });
    }

    return steps;
  }

  /**
   * Validates DAG integrity: verifies dependency existence and detects cycles.
   */
  validateDAG(steps: PlanStep[]): void {
    const stepIds = new Set(steps.map((s) => s.id));

    // Verify all dependencies exist
    for (const step of steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          throw new Error(`Invalid plan DAG: Step "${step.id}" depends on non-existent step "${depId}"`);
        }
        if (depId === step.id) {
          throw new Error(`Invalid plan DAG: Step "${step.id}" depends on itself (self-cycle)`);
        }
      }
    }

    // Cycle detection via topological sort (Kahn's algorithm)
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const s of steps) {
      inDegree.set(s.id, 0);
      adj.set(s.id, []);
    }

    for (const s of steps) {
      for (const depId of s.dependencies) {
        // depId -> s.id
        adj.get(depId)!.push(s.id);
        inDegree.set(s.id, (inDegree.get(s.id) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visitedCount++;

      for (const neighbor of adj.get(current)!) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (visitedCount !== steps.length) {
      throw new Error('Invalid plan DAG: Circular dependency cycle detected in plan steps');
    }
  }

  /**
   * Returns all pending steps whose prerequisite dependencies have completed.
   */
  getNextExecutableSteps(plan: ExecutionPlan): PlanStep[] {
    const completedStepIds = new Set(
      plan.steps.filter((s) => s.status === 'COMPLETED').map((s) => s.id)
    );

    return plan.steps.filter((step) => {
      if (step.status !== 'PENDING') return false;
      return step.dependencies.every((depId) => completedStepIds.has(depId));
    });
  }

  /**
   * Dynamically replans upon a step failure.
   */
  replanOnFailure(plan: ExecutionPlan, failedStepId: string, error: string): ExecutionPlan {
    const failedStep = plan.steps.find((s) => s.id === failedStepId);
    if (!failedStep) return plan;

    failedStep.status = 'FAILED';
    failedStep.error = error;

    // Cascade: mark downstream steps as SKIPPED unless an alternative is created
    const dependentStepIds = new Set<string>();
    const findDependents = (id: string) => {
      for (const s of plan.steps) {
        if (s.dependencies.includes(id) && !dependentStepIds.has(s.id)) {
          dependentStepIds.add(s.id);
          findDependents(s.id);
        }
      }
    };
    findDependents(failedStepId);

    for (const s of plan.steps) {
      if (dependentStepIds.has(s.id) && s.status === 'PENDING') {
        s.status = 'SKIPPED';
        s.error = `Skipped because prerequisite step "${failedStepId}" failed: ${error}`;
      }
    }

    plan.updatedAt = Date.now();
    plan.status = 'FAILED';
    plan.displaySummary = this.formatPlanDisplaySummary(plan.goal, plan.steps);
    return plan;
  }

  /**
   * Formats a concise speech summary suitable for TTS output.
   */
  private formatPlanSpeechSummary(goal: string, steps: PlanStep[]): string {
    const stepCount = steps.length;
    const highestRisk = steps.some((s) => s.riskLevel === 'R2' || s.riskLevel === 'R3')
      ? ' This plan includes actions requiring your explicit authorization before proceeding.'
      : '';

    return `I've prepared a ${stepCount}-step plan to ${goal}.${highestRisk}`;
  }

  /**
   * Formats a detailed Markdown report suitable for Control Center screen display.
   */
  private formatPlanDisplaySummary(goal: string, steps: PlanStep[]): string {
    const lines = [
      `### Execution Plan: ${goal}`,
      '',
      '| # | Step | Tool | Risk | Dependencies | Status |',
      '|---|---|---|---|---|---|',
    ];

    for (const s of steps) {
      const deps = s.dependencies.length > 0 ? s.dependencies.join(', ') : 'None';
      lines.push(`| ${s.id} | ${s.title} | \`${s.toolName}\` | **${s.riskLevel}** | ${deps} | \`${s.status}\` |`);
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * BaseAgent execution entry point.
   */
  async run(instruction: string, _context?: AgentContext): Promise<AgentRunResult<ExecutionPlan>> {
    try {
      const plan = await this.generatePlan(instruction);
      return {
        success: true,
        output: plan,
        speechResponse: plan.speechSummary,
        displayResponse: plan.displaySummary,
        stepsExecuted: 1,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        speechResponse: `I was unable to formulate a plan: ${err.message}`,
        displayResponse: `**Plan Generation Error:** ${err.message}`,
        stepsExecuted: 0,
      };
    }
  }
}
