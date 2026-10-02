import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { BrowserController, createBrowserTools } from '../../src/browser/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('Browser Navigation & Semantic Content Extractor (TASK-202)', () => {
  let controller: BrowserController;
  let registry: ToolRegistry;

  const testHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>JARVIS Browser Test Page</title>
        <style>body { font-family: sans-serif; } .ad-banner { color: red; }</style>
      </head>
      <body>
        <header>
          <h1>Test Heading</h1>
        </header>
        <main>
          <p>Welcome to the autonomous JARVIS browser environment.</p>
          <script>console.log("malicious script that should be stripped");</script>
          <div class="ad-banner">Advertisement text to ignore</div>
          <a href="https://example.com/docs">Documentation Link</a>
          <a href="https://example.com/api">API Reference</a>
        </main>
      </body>
    </html>
  `;

  const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.initialize({ headless: true });
    registry = new ToolRegistry();
    const tools = createBrowserTools(controller);
    for (const tool of tools) {
      registry.register(tool);
    }
  });

  afterAll(async () => {
    if (controller) {
      await controller.close();
    }
  });

  it('should navigate to target URL and verify page title and state', async () => {
    const navResult = await controller.openUrl(dataUri);

    expect(navResult.verified).toBe(true);
    expect(navResult.title).toBe('JARVIS Browser Test Page');
    expect(navResult.status).toBe(200);
    expect(navResult.evidence.loadTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should extract clean text while sanitizing scripts and styles', async () => {
    await controller.openUrl(dataUri);
    const content = await controller.readPage();

    expect(content.title).toBe('JARVIS Browser Test Page');
    expect(content.text).toContain('Welcome to the autonomous JARVIS browser environment.');
    // Scripts and styles should be stripped
    expect(content.text).not.toContain('malicious script');
    expect(content.text).not.toContain('font-family: sans-serif');

    // Verify extracted links
    expect(content.links.length).toBeGreaterThanOrEqual(2);
    expect(content.links.some((l) => l.text === 'Documentation Link')).toBe(true);
    expect(content.links.some((l) => l.href === 'https://example.com/api')).toBe(true);
  });

  it('should execute browser.open_url and browser.read_page through ToolRegistry', async () => {
    const openRes = await registry.execute('browser.open_url', { url: dataUri });
    expect(openRes.success).toBe(true);
    expect(openRes.riskLevel).toBe('R0');
    expect(openRes.evidence).toBeDefined();

    const readRes = await registry.execute('browser.read_page', {});
    expect(readRes.success).toBe(true);
    expect(readRes.riskLevel).toBe('R0');
    expect((readRes.data as any).title).toBe('JARVIS Browser Test Page');
    expect((readRes.data as any).linksCount).toBeGreaterThanOrEqual(2);
  });

  it('should handle invalid or failing navigation with descriptive error in envelope', async () => {
    const res = await registry.execute('browser.open_url', {
      url: 'http://127.0.0.1:99999/non-existent-domain-or-port',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.riskLevel).toBe('R0');
  });
});
