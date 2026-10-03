import { z } from 'zod';
import type { ToolDefinition, ToolResult, AgentContext } from '../tools/types.js';
import type { SessionStore } from './store.js';

export function createMemoryTools(store: SessionStore): ToolDefinition[] {
  return [
    {
      name: 'memory.get_profile',
      description: 'Retrieves the persistent user profile and preferences (language, output verbosity, custom settings).',
      riskLevel: 'R0',
      inputSchema: z.object({}).optional(),
      execute: async (_input: unknown, _context: AgentContext): Promise<ToolResult> => {
        try {
          const profile = await store.getProfile();
          return {
            success: true,
            action: 'memory.get_profile',
            data: profile,
            evidence: { userId: profile.userId, preferredLanguage: profile.preferredLanguage },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.get_profile',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'memory.update_profile',
      description: 'Updates persistent user preferences such as preferred language, output verbosity, or custom preferences. Strictly excludes credentials.',
      riskLevel: 'R1',
      inputSchema: z.object({
        displayName: z.string().optional(),
        preferredLanguage: z.enum(['en', 'ur', 'ar', 'mixed']).optional(),
        outputVerbosity: z.enum(['concise', 'balanced', 'detailed']).optional(),
        speechVoice: z.string().optional(),
        speechRate: z.number().min(0.5).max(2.0).optional(),
        defaultSearchEngine: z.string().optional(),
        defaultDownloadDirectory: z.string().optional(),
        customPreferences: z.record(z.unknown()).optional(),
      }),
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const updated = await store.saveProfile(input);
          return {
            success: true,
            action: 'memory.update_profile',
            data: updated,
            evidence: { userId: updated.userId, updatedAt: updated.updatedAt },
            riskLevel: 'R1',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.update_profile',
            error: (error as Error).message,
            riskLevel: 'R1',
          };
        }
      },
    },
    {
      name: 'memory.get_domain_preference',
      description: 'Retrieves saved preferences and navigation rules for a specific web domain.',
      riskLevel: 'R0',
      inputSchema: z.object({
        domain: z.string().min(1),
      }),
      execute: async (input: { domain: string }, _context: AgentContext): Promise<ToolResult> => {
        try {
          const pref = await store.getDomain(input.domain);
          return {
            success: true,
            action: 'memory.get_domain_preference',
            target: input.domain,
            data: pref,
            evidence: { found: pref !== null },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.get_domain_preference',
            target: input.domain,
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'memory.set_domain_preference',
      description: 'Saves or updates browsing rules, auto-fill permissions, or notes for a web domain.',
      riskLevel: 'R1',
      inputSchema: z.object({
        domain: z.string().min(1),
        autoFillAllowed: z.boolean().optional(),
        preferredSearchUrl: z.string().url().optional(),
        customRules: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const updated = await store.setDomain(input.domain, input);
          return {
            success: true,
            action: 'memory.set_domain_preference',
            target: input.domain,
            data: updated,
            evidence: { domain: updated.domain, visitCount: updated.visitCount },
            riskLevel: 'R1',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.set_domain_preference',
            target: input.domain,
            error: (error as Error).message,
            riskLevel: 'R1',
          };
        }
      },
    },
    {
      name: 'memory.query_tasks',
      description: 'Queries past task execution history by keyword, status, or date range.',
      riskLevel: 'R0',
      inputSchema: z.object({
        query: z.string().optional(),
        status: z.enum(['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_FOR_AUTHORIZATION', 'WAITING_FOR_USER']).optional(),
        intent: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const records = await store.queryTasks(input);
          return {
            success: true,
            action: 'memory.query_tasks',
            data: records,
            evidence: { count: records.length },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.query_tasks',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'memory.get_session_state',
      description: 'Retrieves current active session context, ongoing plan, or state metadata.',
      riskLevel: 'R0',
      inputSchema: z.object({}).optional(),
      execute: async (_input: unknown, _context: AgentContext): Promise<ToolResult> => {
        try {
          const session = await store.getSession();
          return {
            success: true,
            action: 'memory.get_session_state',
            data: session,
            evidence: { hasActiveSession: session !== null },
            riskLevel: 'R0',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.get_session_state',
            error: (error as Error).message,
            riskLevel: 'R0',
          };
        }
      },
    },
    {
      name: 'memory.save_session_state',
      description: 'Saves or updates active session context and goal metadata across restarts.',
      riskLevel: 'R1',
      inputSchema: z.object({
        status: z.enum(['ACTIVE', 'IDLE', 'PAUSED', 'COMPLETED']).optional(),
        activeUrl: z.string().optional(),
        activeTabId: z.string().optional(),
        currentGoal: z.string().optional(),
        activePlanId: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
      execute: async (input: any, _context: AgentContext): Promise<ToolResult> => {
        try {
          const saved = await store.saveSession(input);
          return {
            success: true,
            action: 'memory.save_session_state',
            data: saved,
            evidence: { sessionId: saved.sessionId, status: saved.status },
            riskLevel: 'R1',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.save_session_state',
            error: (error as Error).message,
            riskLevel: 'R1',
          };
        }
      },
    },
    {
      name: 'memory.clear_session',
      description: 'Clears the active session context.',
      riskLevel: 'R1',
      inputSchema: z.object({}).optional(),
      execute: async (_input: unknown, _context: AgentContext): Promise<ToolResult> => {
        try {
          await store.clearSession();
          return {
            success: true,
            action: 'memory.clear_session',
            data: { cleared: true },
            evidence: { cleared: true },
            riskLevel: 'R1',
          };
        } catch (error) {
          return {
            success: false,
            action: 'memory.clear_session',
            error: (error as Error).message,
            riskLevel: 'R1',
          };
        }
      },
    },
  ];
}
