import { BaseAgent, type BaseAgentOptions } from '../agents/base.js';
import { ToolRegistry } from '../tools/registry.js';
import { AiGateway } from '../ai/gateway.js';
import { PlannerAgent } from '../planner/agent.js';
import type { ExecutionPlan, PlanStep } from '../planner/types.js';
import { VerificationService } from '../verification/service.js';
import type { AgentContext, ToolResult, RiskLevel } from '../tools/types.js';
import type { AgentRunResult } from '../agents/types.js';
import type {
  UserIntentType,
  LanguageCode,
  ParsedUserIntent,
  SupervisorExecutionStepLog,
  SupervisorRunOutput,
} from './types.js';

import type { MemoryAgent } from '../memory/agent.js';

export interface SupervisorAgentOptions extends Partial<BaseAgentOptions> {
  planner?: PlannerAgent;
  verification?: VerificationService;
  memory?: MemoryAgent;
  useLLMPlan?: boolean;
}

export class SupervisorAgent extends BaseAgent {
  readonly planner: PlannerAgent;
  readonly verification: VerificationService;
  readonly memory?: MemoryAgent;
  readonly useLLMPlan: boolean;

  constructor(options?: SupervisorAgentOptions) {
    const tools = options?.tools ?? new ToolRegistry();
    const gateway = options?.gateway ?? new AiGateway();

    super({
      name: 'SupervisorAgent',
      role: 'Master Orchestrator & Multi-Agent Coordinator',
      systemPrompt: `You are JARVIS, an advanced voice-first AI assistant with internet and human-like browser control.
You orchestrate specialized agents, manage execution plans, enforce safety risk tiers (R0-R3), and deliver dual-channel outputs:
1. speechResponse: Concise, natural, conversational spoken answers without markdown tables or raw URLs.
2. displayResponse: Comprehensive, structured Markdown reports for the Control Center dashboard.`,
      tools,
      gateway,
    });

    this.useLLMPlan = options?.useLLMPlan ?? (process.env.NODE_ENV !== 'test');
    this.planner = options?.planner ?? new PlannerAgent({ tools, gateway });
    this.verification = options?.verification ?? new VerificationService();
    this.memory = options?.memory;
  }

  async observe(context: AgentContext): Promise<unknown> {
    return {
      availableTools: this.tools.listTools().map((t) => t.name),
      context,
    };
  }

  async decide(observation: unknown, _context: AgentContext): Promise<unknown> {
    return observation;
  }

  async verify(actionResult: ToolResult, _context: AgentContext): Promise<boolean> {
    return actionResult.success;
  }

  /**
   * Parses natural language input for intent, target language, and suggested risk tier.
   */
  parseIntent(instruction: string): ParsedUserIntent {
    const trimmed = instruction.trim();
    const lower = trimmed.toLowerCase();

    // Multilingual language detection
    let language: LanguageCode = 'en';
    const arabicUrduRegex = /[\u0600-\u06FF]/;

    if (arabicUrduRegex.test(instruction)) {
      // Differentiate Urdu vs Arabic based on specific characters or common words
      const urduMarkers = /[ٹڈڑںےہئے]/;
      language = urduMarkers.test(instruction) ? 'ur' : 'ar';
    } else {
      // Roman Urdu checks
      if (
        /\b(karo|karo ge|karo gey|dhoondo|batao|shukriya|kesay|kya|mujhe|chahiye|kardo)\b/i.test(
          lower
        )
      ) {
        language = 'ur';
      }
    }

    // Intent classification
    let intent: UserIntentType = 'CONVERSATIONAL';
    let suggestedRiskLevel: RiskLevel = 'R0';

    const greetingRegex =
      /(hello|hi|hey|salam|assalam|marhaba|who are you|how are you|kaise ho|keifa halak|مرحبا|سلام|السلام|كيف حالك|کون ہو|کیسے ہو)/i;

    if (
      greetingRegex.test(trimmed) &&
      !/\b(search|find|open|download|fill)\b/i.test(lower)
    ) {
      intent = 'CONVERSATIONAL';
      suggestedRiskLevel = 'R0';
    } else if (
      (lower.includes('search') || lower.includes('find') || lower.includes('dhoondo')) &&
      (lower.includes('download') || lower.includes('fill') || lower.includes('open and'))
    ) {
      intent = 'MULTI_STEP';
      suggestedRiskLevel = lower.includes('submit') ? 'R2' : lower.includes('download') ? 'R1' : 'R0';
    } else if (lower.includes('form') || lower.includes('fill') || lower.includes('submit') || lower.includes('form bhar')) {
      intent = 'FORM';
      suggestedRiskLevel = lower.includes('submit') ? 'R2' : 'R1';
    } else if (lower.includes('download') || lower.includes('save file') || lower.includes('download karo')) {
      intent = 'DOWNLOAD';
      suggestedRiskLevel = 'R1';
    } else if (lower.includes('search') || lower.includes('find') || lower.includes('look up') || lower.includes('dhoondo')) {
      intent = 'SEARCH';
      suggestedRiskLevel = 'R0';
    } else if (lower.includes('open') || lower.includes('navigate') || lower.includes('kholo') || lower.match(/https?:\/\/[^\s]+/i)) {
      intent = 'NAVIGATE';
      suggestedRiskLevel = 'R0';
    } else if (lower.includes('verify') || lower.includes('check if') || lower.includes('tasdeeq')) {
      intent = 'VERIFY';
      suggestedRiskLevel = 'R0';
    } else {
      intent = 'SEARCH';
      suggestedRiskLevel = 'R0';
    }

    return {
      intent,
      language,
      confidence: 0.95,
      extractedGoal: trimmed,
      suggestedRiskLevel,
    };
  }

  /**
   * Main orchestrator execution method.
   */
  async execute(
    instruction: string,
    context: AgentContext = {}
  ): Promise<SupervisorRunOutput> {
    const parsedIntent = this.parseIntent(instruction);
    const stepsLog: SupervisorExecutionStepLog[] = [];

    // Conversational fast-path
    if (parsedIntent.intent === 'CONVERSATIONAL') {
      const { speech, display } = this.formatConversationalResponse(instruction, parsedIntent.language);
      return {
        status: 'COMPLETED',
        parsedIntent,
        stepsLog: [],
        completedSteps: 0,
        totalSteps: 0,
        speechResponse: speech,
        displayResponse: display,
      };
    }

    // Step 1: Formulate execution plan via PlannerAgent
    this.emit('plan_start', { goal: instruction });
    const plan = await this.planner.generatePlan(instruction, {
      useLLM: this.useLLMPlan,
    });
    this.emit('plan_created', { plan });

    let completedSteps = 0;
    const totalSteps = plan.steps.length;

    // Step 2: Iterate through DAG steps
    let currentSteps = this.planner.getNextExecutableSteps(plan);

    while (currentSteps.length > 0) {
      for (const step of currentSteps) {
        step.status = 'RUNNING';
        const logEntry: SupervisorExecutionStepLog = {
          stepId: step.id,
          title: step.title,
          toolName: step.toolName,
          riskLevel: step.riskLevel,
          status: 'RUNNING',
          startedAt: Date.now(),
        };
        stepsLog.push(logEntry);

        this.emit('step_start', { step });

        // Authorization check for R2 (external effect) or R3 (high impact)
        if (step.riskLevel === 'R2' || step.riskLevel === 'R3') {
          const isPreAuthorized =
            context.authorizeSubmit === true ||
            (context as any).authorizedRiskLevel === 'R2' ||
            (context as any).authorizedRiskLevel === 'R3';

          if (!isPreAuthorized) {
            step.status = 'WAITING_FOR_AUTHORIZATION';
            logEntry.status = 'WAITING_FOR_AUTHORIZATION';
            plan.status = 'WAITING_FOR_AUTHORIZATION';

            const authSpeech = this.formatAuthorizationSpeech(step, parsedIntent.language);
            const authDisplay = this.formatAuthorizationDisplay(step, plan);

            this.emit('authorization_required', { step, plan });

            return {
              status: 'WAITING_FOR_AUTHORIZATION',
              parsedIntent,
              plan,
              stepsLog,
              completedSteps,
              totalSteps,
              speechResponse: authSpeech,
              displayResponse: authDisplay,
              authorizationPrompt: {
                stepId: step.id,
                actionDescription: step.title,
                riskLevel: step.riskLevel,
              },
            };
          }
        }

        // Resolve dynamic variable inputs (e.g. $step-1.sources[0].url)
        const resolvedInput = this.resolveStepInput(step.input, plan);

        // Capture pre-execution state for verification
        const preSnapshot = await this.verification.captureSnapshot();

        // Execute step via ToolRegistry
        let toolResult: ToolResult;
        try {
          toolResult = await this.tools.execute(step.toolName, resolvedInput, context);
        } catch (err: any) {
          toolResult = {
            success: false,
            action: step.toolName,
            error: err.message,
            riskLevel: step.riskLevel,
            evidence: {},
          };
        }

        step.result = toolResult;
        logEntry.result = toolResult;
        logEntry.completedAt = Date.now();

        if (!toolResult.success) {
          step.status = 'FAILED';
          step.error = toolResult.error;
          logEntry.status = 'FAILED';
          logEntry.error = toolResult.error;

          // Replan on failure
          this.planner.replanOnFailure(plan, step.id, toolResult.error || 'Execution failed');
          this.emit('step_failed', { step, error: toolResult.error });

          const failSpeech = `Step ${step.title} encountered an error: ${toolResult.error || 'Unknown failure'}.`;
          const failDisplay = `### Execution Halted at Step: ${step.title}\n\n**Error:** ${toolResult.error}\n\n` + (plan.displaySummary || '');

          return {
            status: 'FAILED',
            parsedIntent,
            plan,
            stepsLog,
            completedSteps,
            totalSteps,
            speechResponse: failSpeech,
            displayResponse: failDisplay,
          };
        }

        // Post-execution Verification assertions check
        if (step.verificationAssertions && step.verificationAssertions.length > 0) {
          const postSnapshot = await this.verification.captureSnapshot();
          const report = await this.verification.verify(preSnapshot, postSnapshot, step.verificationAssertions);
          logEntry.verificationReport = report;

          if (report.status === 'WAITING_FOR_USER') {
            step.status = 'WAITING_FOR_USER';
            logEntry.status = 'WAITING_FOR_USER';
            plan.status = 'PAUSED';

            const handoffSpeech =
              parsedIntent.language === 'ur'
                ? 'Website par CAPTCHA ya security challenge aagaya hai. Meharbani farma kar isay browser mein mukammal karein.'
                : 'A security challenge or login verification appeared. Please complete it in the browser window to continue.';

            const handoffDisplay = `### Security Challenge Detected\n\n${report.humanNotice || 'Authentication required'}\n\nPlease solve the challenge in the active browser tab.`;

            this.emit('handoff_required', { report, step });

            return {
              status: 'WAITING_FOR_USER',
              parsedIntent,
              plan,
              stepsLog,
              completedSteps,
              totalSteps,
              speechResponse: handoffSpeech,
              displayResponse: handoffDisplay,
              handoffPrompt: {
                reason: report.humanNotice || 'CAPTCHA / Authentication challenge',
                activeUrl: report.postSnapshot.browser?.url,
              },
            };
          }

          if (report.status === 'FAILED') {
            step.status = 'FAILED';
            logEntry.status = 'FAILED';
            step.error = 'Verification check failed to confirm post-state conditions.';
            logEntry.error = step.error;

            this.planner.replanOnFailure(plan, step.id, step.error);

            return {
              status: 'FAILED',
              parsedIntent,
              plan,
              stepsLog,
              completedSteps,
              totalSteps,
              speechResponse: `Action completed, but verification failed: ${step.error}`,
              displayResponse: `### Verification Failed\n\n${step.error}\n\n` + (plan.displaySummary || ''),
            };
          }
        }

        // Step Succeeded
        step.status = 'COMPLETED';
        logEntry.status = 'COMPLETED';
        completedSteps++;
        this.emit('step_completed', { step, result: toolResult });
      }

      // Check next available DAG steps
      currentSteps = this.planner.getNextExecutableSteps(plan);
    }

    plan.status = 'COMPLETED';
    plan.updatedAt = Date.now();

    const { speech, display } = this.formatCompletionOutputs(instruction, plan, stepsLog, parsedIntent.language);

    return {
      status: 'COMPLETED',
      parsedIntent,
      plan,
      stepsLog,
      completedSteps,
      totalSteps,
      speechResponse: speech,
      displayResponse: display,
    };
  }

  /**
   * Resolves dynamic reference tokens like $step-1.sources[0].url or $step-3.filepath
   */
  private resolveStepInput(
    input: Record<string, unknown>,
    plan: ExecutionPlan
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = { ...input };

    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('$step-')) {
        const parts = value.slice(1).split('.'); // ["step-1", "sources[0]", "url"]
        const stepId = parts[0];
        const step = plan.steps.find((s) => s.id === stepId);

        if (step && step.result && step.result.evidence) {
          let current: any = step.result.evidence;
          for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            const arrayMatch = p.match(/^([a-zA-Z0-9_]+)\[(\d+)\]$/);
            if (arrayMatch) {
              const prop = arrayMatch[1];
              const idx = parseInt(arrayMatch[2], 10);
              current = current?.[prop]?.[idx];
            } else {
              current = current?.[p];
            }
          }
          if (current !== undefined) {
            resolved[key] = current;
          }
        }
      }
    }

    return resolved;
  }

  /**
   * Formats conversational responses across English, Urdu, and Arabic.
   */
  private formatConversationalResponse(
    _text: string,
    language: LanguageCode
  ): { speech: string; display: string } {
    if (language === 'ur') {
      return {
        speech: 'Ji, mein JARVIS hoon. Mein aapki internet browsing, search, aur computer tasks mein madad karsakta hoon.',
        display: `**JARVIS Assistant:** جی، میں جاروس ہوں۔ میں آپ کی سرچ، ویب براؤزنگ، اور ٹاسکس میں مدد کے لیے حاضر ہوں۔`,
      };
    }
    if (language === 'ar') {
      return {
        speech: 'Marhaba, ana JARVIS. Kayfa yumkinuni musaadataka al-yawm fi al-bahth aw al-tasaffuh?',
        display: `**JARVIS Assistant:** مرحباً، أنا جارفيس. كيف يمكنني مساعدتك اليوم في تصفح الإنترنت وإنجاز المهام؟`,
      };
    }
    return {
      speech: 'Hello, I am JARVIS. I am online and ready to assist you with web tasks, search, form interactions, and downloads.',
      display: `**JARVIS Assistant:** Hello! I am online and ready to assist you with internet navigation, research, form filling, downloads, and computer tasks.`,
    };
  }

  /**
   * Formats speech response for R2 authorization requirements.
   */
  private formatAuthorizationSpeech(step: PlanStep, language: LanguageCode): string {
    if (language === 'ur') {
      return `Agla marhala "${step.title}" hai jo R2 risk level ka hai. Baraye meharbani isay anjaam dainay ki ijazat dein.`;
    }
    return `The next step is "${step.title}", which has external effects under safety tier ${step.riskLevel}. Please confirm if you would like me to proceed with submission.`;
  }

  /**
   * Formats display response for R2 authorization requirements.
   */
  private formatAuthorizationDisplay(step: PlanStep, plan: ExecutionPlan): string {
    return [
      `### Authorization Required: Step ${step.id} (${step.riskLevel})`,
      '',
      `The assistant has reached an action that mutates external state:`,
      `- **Action:** ${step.title}`,
      `- **Tool:** \`${step.toolName}\``,
      `- **Safety Tier:** \`${step.riskLevel}\``,
      '',
      `> [!WARNING]`,
      `> Form submission or external mutation cannot proceed without your explicit authorization.`,
      '',
      `**To approve:** Reply or command *"Proceed with submission"* or pass \`authorizeSubmit: true\`.`,
      '',
      plan.displaySummary || '',
    ].join('\n');
  }

  /**
   * Formats completion speech & display outputs.
   */
  private formatCompletionOutputs(
    goal: string,
    _plan: ExecutionPlan,
    stepsLog: SupervisorExecutionStepLog[],
    language: LanguageCode
  ): { speech: string; display: string } {
    const completedCount = stepsLog.filter((s) => s.status === 'COMPLETED').length;

    let speech: string;
    if (language === 'ur') {
      speech = `Maine kamyaabi ke saath ${completedCount} marhalay mukammal kar liye hain: ${goal}.`;
    } else if (language === 'ar') {
      speech = `Tammat amaliyat al-tanfeez bi-najah li-${completedCount} khutawat: ${goal}.`;
    } else {
      speech = `I have successfully completed all ${completedCount} planned steps for: ${goal}.`;
    }

    const displayLines = [
      `# Task Execution Completed`,
      `**Goal:** ${goal}`,
      `**Status:** \`COMPLETED\` (${completedCount}/${stepsLog.length} steps)`,
      '',
      '### Execution Log',
      '| Step | Tool | Risk | Duration | Result |',
      '|---|---|---|---|---|',
    ];

    for (const log of stepsLog) {
      const dur = log.completedAt && log.startedAt ? `${log.completedAt - log.startedAt}ms` : '-';
      const statusIcon = log.status === 'COMPLETED' ? '✅ Completed' : log.status === 'FAILED' ? '❌ Failed' : log.status;
      displayLines.push(`| **${log.stepId}** - ${log.title} | \`${log.toolName}\` | \`${log.riskLevel}\` | ${dur} | ${statusIcon} |`);
    }

    displayLines.push('');
    return {
      speech,
      display: displayLines.join('\n'),
    };
  }

  /**
   * BaseAgent entry point.
   */
  async run(instruction: string, context: AgentContext = {}): Promise<AgentRunResult<SupervisorRunOutput>> {
    try {
      const output = await this.execute(instruction, context);

      if (this.memory) {
        try {
          await this.memory.recordTask({
            taskId: output.plan?.id ?? `task_${Date.now()}`,
            sessionId: context.sessionId,
            instruction,
            intent: output.parsedIntent.intent,
            language: output.parsedIntent.language,
            status: output.status,
            stepsCount: output.completedSteps,
            startedAt: output.plan?.createdAt ?? Date.now(),
            completedAt: Date.now(),
            summary: output.displayResponse,
            speechSummary: output.speechResponse,
          });
        } catch {
          // Non-blocking memory persistence
        }
      }

      return {
        success: output.status === 'COMPLETED',
        output,
        speechResponse: output.speechResponse,
        displayResponse: output.displayResponse,
        stepsExecuted: output.completedSteps,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        speechResponse: `An error occurred while executing the task: ${err.message}`,
        displayResponse: `### Execution Failure\n\n**Error:** ${err.message}`,
        stepsExecuted: 0,
      };
    }
  }
}
