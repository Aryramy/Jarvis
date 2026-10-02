import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserController } from '../../src/browser/index.js';

describe('BrowserController Lifecycle (TASK-201)', () => {
  let controller: BrowserController;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.initialize({ headless: true });
  });

  afterAll(async () => {
    if (controller) {
      await controller.close();
    }
  });

  it('should initialize and report initialized state', () => {
    const state = controller.getState();
    expect(state.isInitialized).toBe(true);
    expect(state.tabCount).toBe(1);
    expect(state.activeUrl).toBe('about:blank');
  });

  it('should manage multiple pages/tabs', async () => {
    const page2 = await controller.newPage();
    expect(page2).toBeDefined();

    const state = controller.getState();
    expect(state.tabCount).toBe(2);
    await page2.close();
  });

  it('should cleanly report active page', () => {
    const page = controller.getActivePage();
    expect(page).toBeDefined();
    expect(page.isClosed()).toBe(false);
  });
});
