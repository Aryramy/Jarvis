import { z } from 'zod';

export type RiskLevel = 'R0' | 'R1' | 'R2' | 'R3';

export interface ToolEvidence {
  [key: string]: unknown;
}

export interface ToolResult<TData = unknown> {
  success: boolean;
  action: string;
  target?: string;
  data?: TData;
  evidence?: ToolEvidence;
  error?: string;
  riskLevel: RiskLevel;
  requiresUserConfirmation?: boolean;
}

export interface AgentContext {
  userId?: string;
  sessionId?: string;
  taskId?: string;
  activeLanguage?: 'en' | 'ur' | 'ar' | 'mixed';
  [key: string]: unknown;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: AgentContext) => Promise<ToolResult<TOutput>>;
}
