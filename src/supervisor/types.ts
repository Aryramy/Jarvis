import type { RiskLevel, ToolResult } from '../tools/types.js';
import type { ExecutionPlan } from '../planner/types.js';
import type { VerificationReport } from '../verification/types.js';

export type UserIntentType =
  | 'SEARCH'
  | 'NAVIGATE'
  | 'FORM'
  | 'DOWNLOAD'
  | 'VERIFY'
  | 'MULTI_STEP'
  | 'CONVERSATIONAL';

export type LanguageCode = 'en' | 'ur' | 'ar' | 'mixed';

export interface ParsedUserIntent {
  intent: UserIntentType;
  language: LanguageCode;
  confidence: number;
  extractedGoal: string;
  suggestedRiskLevel: RiskLevel;
}

export interface SupervisorExecutionStepLog {
  stepId: string;
  title: string;
  toolName: string;
  riskLevel: RiskLevel;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'WAITING_FOR_AUTHORIZATION' | 'WAITING_FOR_USER';
  startedAt?: number;
  completedAt?: number;
  result?: ToolResult;
  verificationReport?: VerificationReport;
  error?: string;
}

export interface SupervisorRunOutput {
  status: 'COMPLETED' | 'FAILED' | 'WAITING_FOR_AUTHORIZATION' | 'WAITING_FOR_USER';
  parsedIntent: ParsedUserIntent;
  plan?: ExecutionPlan;
  stepsLog: SupervisorExecutionStepLog[];
  completedSteps: number;
  totalSteps: number;
  speechResponse: string;
  displayResponse: string;
  authorizationPrompt?: {
    stepId: string;
    actionDescription: string;
    riskLevel: RiskLevel;
  };
  handoffPrompt?: {
    reason: string;
    activeUrl?: string;
  };
}
