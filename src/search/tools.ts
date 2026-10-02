import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';
import type { SearchEngine } from './engine.js';

export function createSearchTools(engine: SearchEngine): ToolDefinition[] {
  const webSearchTool: ToolDefinition = {
    name: 'web.search',
    description: 'Searches the web for given query, returning structured sources with titles, URLs, and snippets.',
    riskLevel: 'R0',
    inputSchema: z.object({
      query: z.string().describe('Search query text'),
      site: z.string().optional().describe('Optional domain restriction (e.g. microsoft.com)'),
      limit: z.number().optional().default(5).describe('Maximum number of search results to return'),
    }),
    execute: async (input) => {
      try {
        const result = await engine.search(input.query, {
          site: input.site,
          limit: input.limit,
        });

        return {
          success: result.results.length > 0,
          action: 'web.search',
          target: input.query,
          data: result,
          evidence: {
            query: result.query,
            totalFound: result.totalFound,
            topResultUrl: result.results[0]?.url,
            engineUsed: result.evidence.engineUsed,
            durationMs: result.evidence.durationMs,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'web.search',
          target: input.query,
          error: `Search execution failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const webSearchSiteTool: ToolDefinition = {
    name: 'web.search_site',
    description: 'Searches specifically within a single target domain or website.',
    riskLevel: 'R0',
    inputSchema: z.object({
      domain: z.string().describe('Target domain to search within (e.g. wikipedia.org)'),
      query: z.string().describe('Search query text to find inside the domain'),
      limit: z.number().optional().default(5),
    }),
    execute: async (input) => {
      try {
        const result = await engine.search(input.query, {
          site: input.domain,
          limit: input.limit,
        });

        return {
          success: result.results.length > 0,
          action: 'web.search_site',
          target: `${input.query} on ${input.domain}`,
          data: result,
          evidence: {
            domain: input.domain,
            totalFound: result.totalFound,
            topResultUrl: result.results[0]?.url,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'web.search_site',
          error: `Site search failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  return [webSearchTool, webSearchSiteTool];
}
