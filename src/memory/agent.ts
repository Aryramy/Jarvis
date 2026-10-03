import { BaseAgent, type BaseAgentOptions } from '../agents/base.js';
import { ToolRegistry } from '../tools/registry.js';
import { AiGateway } from '../ai/gateway.js';
import type { AgentContext, ToolResult } from '../tools/types.js';
import type { AgentRunResult } from '../agents/types.js';
import { SessionStore, type SessionStoreOptions } from './store.js';
import { createMemoryTools } from './tools.js';
import type {
  UserProfile,
  DomainPreference,
  SessionState,
  TaskRecord,
  MemoryQueryFilter,
} from './types.js';

export interface MemoryAgentOptions extends Partial<BaseAgentOptions> {
  store?: SessionStore;
  storeOptions?: SessionStoreOptions;
}

export class MemoryAgent extends BaseAgent {
  readonly store: SessionStore;

  constructor(options?: MemoryAgentOptions) {
    const tools = options?.tools ?? new ToolRegistry();
    const gateway = options?.gateway ?? new AiGateway();

    super({
      name: 'MemoryAgent',
      role: 'Cross-Session Persistent Memory & User Preference Manager',
      systemPrompt: `You are JARVIS Memory Agent. You manage persistent user preferences, domain navigation rules, session states, and historical task executions across application restarts.
CRITICAL SAFETY RULE: You strictly exclude and redact all credentials, passwords, session tokens, and secrets from persistent memory.
You produce dual outputs:
1. speechResponse: Brief, natural spoken response.
2. displayResponse: Detailed formatted markdown report.`,
      tools,
      gateway,
    });

    this.store = options?.store ?? new SessionStore(options?.storeOptions);

    // Register all memory tools into ToolRegistry
    const memoryTools = createMemoryTools(this.store);
    for (const tool of memoryTools) {
      this.tools.register(tool);
    }
  }

  // =========================================================================
  // Programmatic API
  // =========================================================================

  async getProfile(): Promise<UserProfile> {
    return this.store.getProfile();
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    return this.store.saveProfile(updates);
  }

  async getDomain(domain: string): Promise<DomainPreference | null> {
    return this.store.getDomain(domain);
  }

  async setDomain(domain: string, preference: Partial<DomainPreference>): Promise<DomainPreference> {
    return this.store.setDomain(domain, preference);
  }

  async listDomains(): Promise<DomainPreference[]> {
    return this.store.listDomains();
  }

  async getSession(): Promise<SessionState | null> {
    return this.store.getSession();
  }

  async saveSession(state: Partial<SessionState>): Promise<SessionState> {
    return this.store.saveSession(state);
  }

  async clearSession(): Promise<void> {
    return this.store.clearSession();
  }

  async recordTask(task: TaskRecord): Promise<TaskRecord> {
    return this.store.addTaskRecord(task);
  }

  async queryTasks(filter?: MemoryQueryFilter): Promise<TaskRecord[]> {
    return this.store.queryTasks(filter);
  }

  async clearAll(): Promise<void> {
    return this.store.clearAll();
  }

  async exportAll(): Promise<{
    profile: UserProfile;
    domains: DomainPreference[];
    session: SessionState | null;
    tasks: TaskRecord[];
  }> {
    return this.store.exportAll();
  }

  // =========================================================================
  // BaseAgent Lifecycle Implementation
  // =========================================================================

  async observe(context: AgentContext): Promise<unknown> {
    const profile = await this.store.getProfile();
    const session = await this.store.getSession();
    return {
      userId: profile.userId,
      language: profile.preferredLanguage,
      activeSessionId: session?.sessionId,
      sessionStatus: session?.status,
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
   * Executes a natural language memory query or command.
   */
  async run(instruction: string, _context?: AgentContext): Promise<AgentRunResult> {
    const normalized = instruction.toLowerCase().trim();

    // 1. Language update command
    if (normalized.includes('language') && (normalized.includes('set') || normalized.includes('change') || normalized.includes('switch'))) {
      let targetLang: 'en' | 'ur' | 'ar' = 'en';
      if (normalized.includes('urdu') || normalized.includes('اردو')) targetLang = 'ur';
      else if (normalized.includes('arabic') || normalized.includes('عربي')) targetLang = 'ar';
      else if (normalized.includes('english') || normalized.includes('انگریزی')) targetLang = 'en';

      const updated = await this.updateProfile({ preferredLanguage: targetLang });
      const speech = targetLang === 'ur'
        ? 'Aap ki pasandeeda zaban Urdu par set kar di gayi hai.'
        : targetLang === 'ar'
        ? 'تم ضبط لغتكم المفضلة إلى العربية بنجاح.'
        : `Your preferred language has been updated to ${targetLang.toUpperCase()}.`;

      return {
        success: true,
        output: updated,
        speechResponse: speech,
        displayResponse: `### Preferred Language Updated\n- **New Language:** \`${targetLang}\`\n- **Updated At:** ${new Date(updated.updatedAt).toISOString()}`,
        stepsExecuted: 1,
      };
    }

    // 2. Query recent task history
    if (normalized.includes('history') || normalized.includes('recent tasks') || normalized.includes('what did we do')) {
      const tasks = await this.queryTasks({ limit: 5 });
      if (tasks.length === 0) {
        return {
          success: true,
          output: tasks,
          speechResponse: 'You have no recorded task history in memory.',
          displayResponse: `### Task History\n\n*No task execution records found.*`,
          stepsExecuted: 1,
        };
      }

      const speech = `Found ${tasks.length} recent task${tasks.length > 1 ? 's' : ''} in memory. The last task was: ${tasks[0].instruction}.`;
      const tableRows = tasks
        .map(
          (t) =>
            `| \`${t.taskId}\` | ${t.instruction} | \`${t.status}\` | ${new Date(t.startedAt).toLocaleTimeString()} |`
        )
        .join('\n');

      return {
        success: true,
        output: tasks,
        speechResponse: speech,
        displayResponse: `### Recent Task History\n\n| Task ID | Instruction | Status | Time |\n|---|---|---|---|\n${tableRows}`,
        stepsExecuted: 1,
      };
    }

    // 3. Clear session command
    if (normalized.includes('clear session') || normalized.includes('reset session')) {
      await this.clearSession();
      return {
        success: true,
        output: { cleared: true },
        speechResponse: 'Your active session state has been cleared.',
        displayResponse: `### Session Cleared\nActive session state and current goals have been reset.`,
        stepsExecuted: 1,
      };
    }

    // 4. Default: inspect current profile & memory summary
    const profile = await this.getProfile();
    const session = await this.getSession();
    const recentTasks = await this.queryTasks({ limit: 3 });

    const speech = `Your profile is configured with language ${profile.preferredLanguage.toUpperCase()} and ${profile.outputVerbosity} verbosity.`;
    const display = `### Persistent Memory Overview
- **User ID:** \`${profile.userId}\`
- **Display Name:** ${profile.displayName ?? 'None'}
- **Language:** \`${profile.preferredLanguage}\`
- **Verbosity:** \`${profile.outputVerbosity}\`
- **Active Session:** ${session ? `\`${session.sessionId}\` (${session.status})` : '*None*'}
- **Stored Tasks:** ${recentTasks.length} recorded`;

    return {
      success: true,
      output: { profile, session, recentTasks },
      speechResponse: speech,
      displayResponse: display,
      stepsExecuted: 1,
    };
  }
}
