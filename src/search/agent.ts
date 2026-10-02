import { BaseAgent, type BaseAgentOptions } from '../agents/base.js';
import type { AgentContext, ToolResult } from '../tools/types.js';
import type { AgentRunResult } from '../agents/types.js';
import { SearchEngine } from './engine.js';
import type { SearchResult } from './types.js';
import type { BrowserController } from '../browser/index.js';

export interface SearchAgentOptions extends Partial<BaseAgentOptions> {
  browser?: BrowserController;
}

export class SearchAgent extends BaseAgent {
  readonly engine: SearchEngine;

  constructor(options: SearchAgentOptions = {}) {
    super({
      name: options.name ?? 'SearchAgent',
      role: options.role ?? 'Internet Search Specialist',
      systemPrompt:
        options.systemPrompt ??
        'You are an expert web search agent. Formulate precise search queries, extract reputable sources, and cross-reference search results.',
      tools: options.tools,
      gateway: options.gateway,
    });
    this.engine = new SearchEngine(options.browser);
  }

  /**
   * Observe stage: inspects instruction to detect search requirements and domain targets.
   */
  async observe(context: AgentContext): Promise<{ query: string; site?: string }> {
    const rawInstruction = (context.instruction as string) || '';

    // Check for explicit site: directive or domain mentions
    const siteMatch = /site:([a-zA-Z0-9.-]+)/i.exec(rawInstruction)
      || /(?:on|inside|from)\s+([a-zA-Z0-9.-]+\.(?:com|org|io|net|gov|edu))/i.exec(rawInstruction);

    const site = siteMatch ? siteMatch[1] : undefined;
    let query = rawInstruction
      .replace(/^(?:jarvis,?\s*)?(?:search(?:\s+the\s+web|\s+google)?\s+for|find|look\s+up)\s+/i, '')
      .replace(/(?:on|inside|from)\s+([a-zA-Z0-9.-]+\.(?:com|org|io|net|gov|edu))/i, '')
      .trim();

    if (!query) {
      query = rawInstruction;
    }

    return { query, site };
  }

  /**
   * Decide stage: validates and finalizes the formulated query.
   */
  async decide(observation: { query: string; site?: string }, _context: AgentContext): Promise<string> {
    return this.engine.formulateQuery(observation.query, observation.site);
  }

  /**
   * Verify stage: checks whether the search returned valid non-empty results.
   */
  async verify(actionResult: ToolResult, _context: AgentContext): Promise<boolean> {
    if (!actionResult.success || !actionResult.data) {
      return false;
    }
    const data = actionResult.data as SearchResult;
    return Array.isArray(data.results) && data.results.length > 0 && !!data.results[0].url;
  }

  /**
   * Runs the complete SearchAgent cycle: observe -> decide -> act -> verify -> format output.
   */
  async run(instruction: string, context: AgentContext = {}): Promise<AgentRunResult<SearchResult>> {
    const execContext: AgentContext = { ...context, instruction };
    const observation = await this.observe(execContext);
    const finalQuery = await this.decide(observation, execContext);

    const searchResult = await this.engine.search(finalQuery, {
      limit: 5,
      site: observation.site,
    });

    const isVerified = searchResult.results.length > 0;

    let speechResponse: string;
    let displayResponse: string;

    if (isVerified) {
      const topResult = searchResult.results[0];
      speechResponse = `I found ${searchResult.results.length} results. The first one is from ${topResult.source}: "${topResult.title}".`;

      const rows = searchResult.results
        .map(
          (r) =>
            `| ${r.rank} | [${r.title}](${r.url}) | \`${r.source}\` | ${r.snippet.slice(0, 120)}... |`
        )
        .join('\n');

      displayResponse = `### Search Results for "${finalQuery}"\n\n| Rank | Title | Source | Snippet |\n|---|---|---|---|\n${rows}\n\n*Found ${searchResult.results.length} verified sources in ${searchResult.evidence.durationMs}ms via ${searchResult.evidence.engineUsed}.*`;
    } else {
      speechResponse = `I couldn't find any relevant results for "${finalQuery}".`;
      displayResponse = `No results found for query: \`${finalQuery}\`.`;
    }

    return {
      success: isVerified,
      output: searchResult,
      speechResponse,
      displayResponse,
      stepsExecuted: 1,
    };
  }
}
