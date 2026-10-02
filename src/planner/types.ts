import type { RiskLevel, ToolResult } from '../tools/types.js';
import type { VerificationAssertion } from '../verification/types.js';

export type PlanStepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'WAITING_FOR_USER'
  | 'WAITING_FOR_AUTHORIZATION';

export type PlanStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'WAITING_FOR_AUTHORIZATION'
  | 'PAUSED';

export interface PlanStep {
  id: string;
  title: string;
  toolName: string;
  input: Record<string, unknown>;
  dependencies: string[];
  riskLevel: RiskLevel;
  expectedOutcome: string;
  verificationAssertions?: VerificationAssertion[];
  status: PlanStepStatus;
  result?: ToolResult;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  createdAt: number;
  updatedAt: number;
  status: PlanStatus;
  currentStepId?: string;
  speechSummary?: string;
  displaySummary?: string;
}

export interface PlanGenerationOptions {
  availableTools?: string[];
  maxSteps?: number;
  allowedRiskLevel?: RiskLevel;
  requireVerification?: boolean;
  useLLM?: boolean;
}
