import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserController, createBrowserTools } from '../../src/browser/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('Browser Semantic Interaction Subsystem (TASK-401)', () => {
  let controller: BrowserController;
  let registry: ToolRegistry;

  const interactionHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Semantic Interaction Fixture</title>
        <style>
          body { font-family: sans-serif; height: 3000px; margin: 20px; }
          .section { margin-bottom: 24px; }
          #output { padding: 10px; background: #eee; min-height: 20px; }
        </style>
      </head>
      <body>
        <h1>Interaction Playground</h1>
        <div id="output">Initial State</div>

        <div class="section">
          <button id="btn-submit" onclick="document.getElementById('output').textContent = 'Action: Submitted'">
            Submit Form
          </button>
          <button id="btn-reset" onclick="document.getElementById('output').textContent = 'Action: Reset'">
            Reset Form
          </button>
          <a href="#section2" id="nav-link" onclick="document.getElementById('output').textContent = 'Action: Link Clicked'">
            Jump to Section
          </a>
        </div>

        <div class="section">
          <label for="full-name">Full Name</label>
          <input id="full-name" type="text" value="Default Name" />
        </div>

        <div class="section">
          <input id="search-box" type="search" placeholder="Search documentation..." />
        </div>

        <div class="section">
          <label for="country-select">Country</label>
          <select id="country-select">
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="pk">Pakistan</option>
            <option value="de">Germany</option>
          </select>
        </div>

        <div class="section">
          <label>
            <input type="checkbox" id="newsletter-check" />
            Subscribe to Newsletter
          </label>
        </div>

        <div class="section">
          <label>
            <input type="radio" name="subscription" value="monthly" />
            Monthly Billing
          </label>
          <label>
            <input type="radio" name="subscription" value="annual" />
            Annual Billing
          </label>
        </div>

        <div id="section2" style="margin-top: 1500px;">
          <h2>Deep Section</h2>
          <p>Reached bottom content.</p>
        </div>
      </body>
    </html>
  `;

  const fixtureUrl = `data:text/html;charset=utf-8,${encodeURIComponent(interactionHtml)}`;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.initialize({ headless: true });
    registry = new ToolRegistry();
    const tools = createBrowserTools(controller);
    for (const tool of tools) {
      registry.register(tool);
    }
    await controller.openUrl(fixtureUrl);
  });

  afterAll(async () => {
    if (controller) {
      await controller.close();
    }
  });

  describe('Controller Direct Interactions', () => {
    it('should click button by accessible name and trigger event', async () => {
      const clickResult = await controller.click('Submit Form');

      expect(clickResult.verified).toBe(true);
      expect(clickResult.matchedBy).toBe('role:button');

      const page = controller.getActivePage();
      const outputText = await page.locator('#output').innerText();
      expect(outputText).toBe('Action: Submitted');
    });

    it('should click link by accessible role and text', async () => {
      const clickResult = await controller.click('Jump to Section', { role: 'link' });

      expect(clickResult.verified).toBe(true);
      expect(clickResult.matchedBy).toBe('role:link');

      const page = controller.getActivePage();
      const outputText = await page.locator('#output').innerText();
      expect(outputText).toBe('Action: Link Clicked');
    });

    it('should type into an input identified by accessible label', async () => {
      const typeResult = await controller.type('Full Name', 'Alexander Jarvis', { clearFirst: true });

      expect(typeResult.verified).toBe(true);
      expect(typeResult.matchedBy).toBe('label');
      expect(typeResult.value).toBe('Alexander Jarvis');
    });

    it('should type into an input identified by placeholder', async () => {
      const typeResult = await controller.type('Search documentation...', 'quantum mechanics');

      expect(typeResult.verified).toBe(true);
      expect(typeResult.matchedBy).toBe('placeholder');
      expect(typeResult.value).toBe('quantum mechanics');
    });

    it('should clear an input field', async () => {
      const clearResult = await controller.clear('Full Name');

      expect(clearResult.verified).toBe(true);
      expect(clearResult.value).toBe('');
    });

    it('should select an option in a dropdown by label', async () => {
      const selectResult = await controller.selectOption('Country', 'pk');

      expect(selectResult.verified).toBe(true);
      expect(selectResult.selectedValues).toContain('pk');
    });

    it('should toggle a checkbox by label', async () => {
      const checkResult = await controller.check('Subscribe to Newsletter', true);

      expect(checkResult.verified).toBe(true);
      expect(checkResult.checked).toBe(true);

      const uncheckResult = await controller.check('Subscribe to Newsletter', false);
      expect(uncheckResult.verified).toBe(true);
      expect(uncheckResult.checked).toBe(false);
    });

    it('should select a radio button by label', async () => {
      const radioResult = await controller.check('Annual Billing', true);

      expect(radioResult.verified).toBe(true);
      expect(radioResult.checked).toBe(true);
    });

    it('should scroll down, bottom, and top with verified position tracking', async () => {
      const scrollDown = await controller.scroll('down', 600);
      expect(scrollDown.verified).toBe(true);
      expect(scrollDown.scrollYAfter).toBeGreaterThan(0);

      const scrollBottom = await controller.scroll('bottom');
      expect(scrollBottom.verified).toBe(true);
      expect(scrollBottom.scrollYAfter).toBeGreaterThanOrEqual(scrollDown.scrollYAfter);

      const scrollTop = await controller.scroll('top');
      expect(scrollTop.verified).toBe(true);
      expect(scrollTop.scrollYAfter).toBe(0);
    });
  });

  describe('Registered Tool Execution Envelope', () => {
    it('should execute browser.click through ToolRegistry with R0 riskLevel and evidence', async () => {
      const tool = registry.get('browser.click');
      expect(tool).toBeDefined();

      const result = await tool!.execute({ target: 'Reset Form' });
      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.click');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence).toBeDefined();

      const page = controller.getActivePage();
      const outputText = await page.locator('#output').innerText();
      expect(outputText).toBe('Action: Reset');
    });

    it('should execute browser.type through ToolRegistry with R1 riskLevel and evidence', async () => {
      const tool = registry.get('browser.type');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        target: 'Full Name',
        text: 'Autonomous Agent',
        clearFirst: true,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.type');
      expect(result.riskLevel).toBe('R1');
      expect(result.evidence).toMatchObject({
        target: 'Full Name',
        expectedValue: 'Autonomous Agent',
        verified: true,
      });
    });

    it('should execute browser.select through ToolRegistry with R1 riskLevel', async () => {
      const tool = registry.get('browser.select');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        target: 'Country',
        value: 'de',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.select');
      expect(result.riskLevel).toBe('R1');
    });

    it('should execute browser.scroll through ToolRegistry with R0 riskLevel', async () => {
      const tool = registry.get('browser.scroll');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        direction: 'down',
        amount: 300,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.scroll');
      expect(result.riskLevel).toBe('R0');
    });

    it('should execute browser.check through ToolRegistry with R1 riskLevel', async () => {
      const tool = registry.get('browser.check');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        target: 'Subscribe to Newsletter',
        checked: true,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.check');
      expect(result.riskLevel).toBe('R1');
    });

    it('should execute browser.press_key through ToolRegistry', async () => {
      const tool = registry.get('browser.press_key');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        key: 'Tab',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.press_key');
      expect(result.riskLevel).toBe('R0');
    });
  });
});
