import { z } from 'zod';
import type { ToolDefinition, ToolResult, AgentContext } from './types.js';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Registers a strongly-typed tool with input schema and risk level.
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`[ToolRegistry] Tool with name '${tool.name}' is already registered.`);
    }
    const normalizedTool = {
      ...tool,
      inputSchema: tool.inputSchema ?? (tool as any).schema,
    };
    this.tools.set(tool.name, normalizedTool);
  }

  /**
   * Retrieves a tool by name.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns all registered tools.
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Alias for list()
   */
  listTools(): ToolDefinition[] {
    return this.list();
  }

  /**
   * Executes a registered tool with runtime Zod input validation and structured result envelopes.
   */
  async execute(name: string, rawInput: unknown, context: AgentContext = {}): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        action: name,
        riskLevel: 'R0',
        error: `Tool '${name}' not found in registry.`,
      };
    }

    // Validate inputs against tool schema
    const parseResult = tool.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return {
        success: false,
        action: name,
        riskLevel: tool.riskLevel,
        error: `Invalid input parameters for tool '${name}': ${errorMsg}`,
      };
    }

    try {
      const result = await tool.execute(parseResult.data, context);
      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        action: name,
        riskLevel: tool.riskLevel,
        error: `Tool execution failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Formats registered tools for the OpenAI/LLM function calling API.
   */
  formatForAi(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return Array.from(this.tools.values()).map((tool) => {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: zodToJsonSchema(tool.inputSchema),
        },
      };
    });
  }
}

/**
 * Lightweight Zod to JSON Schema converter for standard object schemas.
 */
export function zodToJsonSchema(schema: z.ZodType<any>): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const field = value as z.ZodTypeAny;
      properties[key] = zodFieldToJsonSchema(field);

      if (!field.isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object' };
}

function zodFieldToJsonSchema(field: z.ZodTypeAny): Record<string, unknown> {
  // Unwrap optional/nullable
  let current: z.ZodTypeAny = field;
  let description: string | undefined;

  if (current.description) {
    description = current.description;
  }

  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
    current = current.unwrap();
    if (!description && current.description) {
      description = current.description;
    }
  }

  const base: Record<string, unknown> = {};
  if (description) {
    base.description = description;
  }

  if (current instanceof z.ZodString) {
    return { ...base, type: 'string' };
  }
  if (current instanceof z.ZodNumber) {
    return { ...base, type: 'number' };
  }
  if (current instanceof z.ZodBoolean) {
    return { ...base, type: 'boolean' };
  }
  if (current instanceof z.ZodEnum) {
    return { ...base, type: 'string', enum: current.options };
  }
  if (current instanceof z.ZodArray) {
    return {
      ...base,
      type: 'array',
      items: zodFieldToJsonSchema(current.element),
    };
  }
  if (current instanceof z.ZodObject) {
    return { ...base, ...zodToJsonSchema(current) };
  }

  return { ...base, type: 'string' };
}
