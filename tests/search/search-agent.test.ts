import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { SearchEngine, SearchAgent, createSearchTools } from '../../src/search/index.js';
import { BrowserController } from '../../src/browser/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('SearchEngine & Query Formulator', () => {
  let controller: BrowserController;
  let engine: SearchEngine;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.initialize({ headless: true });
    engine = new SearchEngine(controller);
  });

  afterAll(async () => {
    if (controller) {
      await controller.close();
    }
  });

  it('should formulate queries accurately with and without site restrictions', () => {
    expect(engine.formulateQuery('Power BI scheduled refresh')).toBe('Power BI scheduled refresh');
    expect(engine.formulateQuery('Fabric documentation', 'microsoft.com')).toBe(
      'Fabric documentation site:microsoft.com'
    );
    expect(engine.formulateQuery('Fabric documentation', 'https://learn.microsoft.com/en-us/')).toBe(
      'Fabric documentation site:learn.microsoft.com'
    );
    expect(engine.formulateQuery('Fabric site:microsoft.com', 'microsoft.com')).toBe(
      'Fabric site:microsoft.com'
    );
  });

  it('should decode tracking redirect URLs correctly (both Bing base64 and DuckDuckGo)', () => {
    // Bing base64 URL
    const bingUrl =
      'https://www.bing.com/ck/a?!&&p=123&u=a1aHR0cHM6Ly9sZWFybi5taWNyb3NvZnQuY29tL2ZhYnJpYw&ntb=1';
    const decodedBing = engine.decodeRedirectUrl(bingUrl);
    expect(decodedBing).toBe('https://learn.microsoft.com/fabric');

    // DuckDuckGo URL
    const ddgUrl =
      'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&rut=1';
    const decodedDdg = engine.decodeRedirectUrl(ddgUrl);
    expect(decodedDdg).toBe('https://example.com/docs');
  });

  it('should execute live web search and return verified sources', async () => {
    const result = await engine.search('Microsoft Fabric documentation', { limit: 3 });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.query).toContain('Microsoft Fabric');
    expect(result.evidence.durationMs).toBeGreaterThan(0);

    const first = result.results[0];
    expect(first.title).toBeDefined();
    expect(first.url.startsWith('http')).toBe(true);
    expect(first.source).toBeDefined();
  }, 25000);
});

describe('SearchAgent & Tool Registry Integration', () => {
  let controller: BrowserController;
  let engine: SearchEngine;
  let agent: SearchAgent;
  let registry: ToolRegistry;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.initialize({ headless: true });
    engine = new SearchEngine(controller);
    agent = new SearchAgent({ browser: controller });

    registry = new ToolRegistry();
    const tools = createSearchTools(engine);
    for (const t of tools) {
      registry.register(t);
    }
  });

  afterAll(async () => {
    if (controller) {
      await controller.close();
    }
  });

  it('should parse user intent, execute search, and produce distinct speech & display outputs', async () => {
    const runResult = await agent.run('search the web for Microsoft Fabric documentation on microsoft.com');

    expect(runResult.success).toBe(true);
    expect(runResult.output?.results.length).toBeGreaterThan(0);
    // Spoken response must be conversational and concise
    expect(runResult.speechResponse).toBeDefined();
    expect(runResult.speechResponse).toContain('I found');
    expect(runResult.speechResponse).not.toContain('| Rank |'); // No markdown table in speech!
    // Display response must contain formatted markdown table with links
    expect(runResult.displayResponse).toContain('| Rank | Title | Source | Snippet |');
    expect(runResult.displayResponse).toContain('microsoft.com');
  }, 25000);

  it('should register web.search tool and execute via ToolRegistry with evidence', async () => {
    const toolResult = await registry.execute('web.search', {
      query: 'Playwright automation',
      limit: 3,
    });

    expect(toolResult.success).toBe(true);
    expect(toolResult.riskLevel).toBe('R0');
    expect(toolResult.evidence).toBeDefined();
    expect(toolResult.evidence?.totalFound).toBeGreaterThanOrEqual(1);
    expect(toolResult.evidence?.topResultUrl).toMatch(/^https?:\/\//);
  }, 25000);
});
