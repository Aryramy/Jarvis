import type { ToolResult, AgentContext } from '../tools/types.js';

export interface AgentLifecycleEvents {
  onStart?: (instruction: string, context: AgentContext) => void;
  onObserve?: (state: unknown) => void;
  onDecide?: (decision: unknown) => void;
  onAct?: (action: string, input: unknown) => void;
  onVerify?: (result: ToolResult) => void;
  onError?: (error: Error) => void;
  onComplete?: (output: unknown) => void;
}

export interface AgentRunResult<T = unknown> {
  success: boolean;
  output?: T;
  speechResponse?: string;
  displayResponse?: string;
  error?: string;
  stepsExecuted: number;
}
