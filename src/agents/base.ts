import { EventEmitter } from 'node:events';
import { AiGateway } from '../ai/index.js';
import { ToolRegistry } from '../tools/index.js';
import type { ToolResult, AgentContext } from '../tools/types.js';
import type { AgentRunResult } from './types.js';

export interface BaseAgentOptions {
  name: string;
  role: string;
  systemPrompt: string;
  tools?: ToolRegistry;
  gateway?: AiGateway;
}

export abstract class BaseAgent extends EventEmitter {
  readonly name: string;
  readonly role: string;
  readonly systemPrompt: string;
  readonly tools: ToolRegistry;
  readonly gateway: AiGateway;

  constructor(options: BaseAgentOptions) {
    super();
    this.name = options.name;
    this.role = options.role;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools ?? new ToolRegistry();
    this.gateway = options.gateway ?? new AiGateway();
  }

  /**
   * Observe stage: inspects the environment, browser state, or input context.
   */
  abstract observe(context: AgentContext): Promise<unknown>;

  /**
   * Decide stage: determines the next action or plan step based on observed state.
   */
  abstract decide(observation: unknown, context: AgentContext): Promise<unknown>;

  /**
   * Act stage: executes an action via the ToolRegistry.
   */
  async act(action: string, input: unknown, context: AgentContext): Promise<ToolResult> {
    this.emit('act', { action, input });
    const result = await this.tools.execute(action, input, context);
    this.emit('acted', { action, result });
    return result;
  }

  /**
   * Verify stage: checks whether the action achieved the expected state truth.
   */
  abstract verify(actionResult: ToolResult, context: AgentContext): Promise<boolean>;

  /**
   * Executes the agent workflow for a given instruction.
   */
  abstract run(instruction: string, context?: AgentContext): Promise<AgentRunResult>;
}
