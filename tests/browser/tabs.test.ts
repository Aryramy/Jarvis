import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserController, createBrowserTools } from '../../src/browser/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('Browser State & Multi-Tab Management (TASK-501)', () => {
  let controller: BrowserController;
  let registry: ToolRegistry;

  const tab1Html = `<!DOCTYPE html><html><head><title>Tab 1 - Dashboard</title></head><body><h1>Dashboard</h1></body></html>`;
  const tab2Html = `<!DOCTYPE html><html><head><title>Tab 2 - Research</title></head><body><h1>Research Portal</h1></body></html>`;
  const tab3Html = `<!DOCTYPE html><html><head><title>Tab 3 - Settings</title></head><body><h1>Settings</h1></body></html>`;

  const tab1Url = `data:text/html;charset=utf-8,${encodeURIComponent(tab1Html)}`;
  const tab2Url = `data:text/html;charset=utf-8,${encodeURIComponent(tab2Html)}`;
  const tab3Url = `data:text/html;charset=utf-8,${encodeURIComponent(tab3Html)}`;

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

  describe('TabRegistry Core Lifecycle & Context Tracking', () => {
    it('should register initial tab on controller initialization', async () => {
      const state = controller.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.tabCount).toBe(1);
      expect(state.activeTabId).toBe('tab-1');

      const tabs = await controller.listTabs();
      expect(tabs.length).toBe(1);
      expect(tabs[0].id).toBe('tab-1');
      expect(tabs[0].isActive).toBe(true);
    });

    it('should open new tab with URL and task context metadata', async () => {
      await controller.openUrl(tab1Url);

      const tab2Info = await controller.openTab(tab2Url, {
        taskId: 'task-402',
        description: 'Researching technical docs',
        metadata: { category: 'research' },
      });

      expect(tab2Info.id).toBe('tab-2');
      expect(tab2Info.isActive).toBe(true);
      expect(tab2Info.context?.taskId).toBe('task-402');
      expect(tab2Info.context?.description).toBe('Researching technical docs');

      const tabs = await controller.listTabs();
      expect(tabs.length).toBe(2);

      const activePage = controller.getActivePage();
      const title = await activePage.title();
      expect(title).toBe('Tab 2 - Research');
    });

    it('should accurately switch active tabs and preserve state', async () => {
      const switchedTab = await controller.switchTab('tab-1');
      expect(switchedTab.id).toBe('tab-1');
      expect(switchedTab.isActive).toBe(true);

      const activePage = controller.getActivePage();
      const title = await activePage.title();
      expect(title).toBe('Tab 1 - Dashboard');

      const tabs = await controller.listTabs();
      const tab1 = tabs.find((t) => t.id === 'tab-1');
      const tab2 = tabs.find((t) => t.id === 'tab-2');
      expect(tab1?.isActive).toBe(true);
      expect(tab2?.isActive).toBe(false);
      // Context on tab 2 must be preserved
      expect(tab2?.context?.taskId).toBe('task-402');
    });

    it('should close a specific tab and automatically switch focus to remaining tab', async () => {
      // Open a third tab
      await controller.openTab(tab3Url, { taskId: 'task-403', description: 'Settings config' });
      let tabs = await controller.listTabs();
      expect(tabs.length).toBe(3);

      // Close tab-3
      const closeResult = await controller.closeTab('tab-3');
      expect(closeResult.closedTabId).toBe('tab-3');
      expect(closeResult.remainingTabs).toBe(2);
      expect(closeResult.verified).toBe(true);

      tabs = await controller.listTabs();
      expect(tabs.length).toBe(2);
      expect(tabs.some((t) => t.id === 'tab-3')).toBe(false);
    });

    it('should update tab registry automatically when page is closed externally', async () => {
      // Create a page directly
      const extraPage = await controller.newPage();
      let tabs = await controller.listTabs();
      const preCount = tabs.length;

      // Close the underlying Playwright page directly
      await extraPage.close();

      tabs = await controller.listTabs();
      expect(tabs.length).toBe(preCount - 1);
    });
  });

  describe('Registered Tool Execution Envelope', () => {
    it('should execute browser.open_tab via ToolRegistry with evidence', async () => {
      const openTool = registry.get('browser.open_tab');
      expect(openTool).toBeDefined();

      const result = await openTool!.execute({
        url: tab3Url,
        taskId: 'task-tool-test',
        description: 'Testing tool invocation',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.open_tab');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence).toMatchObject({
        taskId: 'task-tool-test',
      });
    });

    it('should execute browser.list_tabs via ToolRegistry', async () => {
      const listTool = registry.get('browser.list_tabs');
      expect(listTool).toBeDefined();

      const result = await listTool!.execute({});
      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.list_tabs');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence?.tabCount).toBeGreaterThanOrEqual(2);
    });

    it('should execute browser.switch_tab via ToolRegistry', async () => {
      const switchTool = registry.get('browser.switch_tab');
      expect(switchTool).toBeDefined();

      const result = await switchTool!.execute({ tabId: 'tab-1' });
      expect(result.success).toBe(true);
      expect(result.action).toBe('browser.switch_tab');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence?.activeTabId).toBe('tab-1');
    });

    it('should execute browser.close_tab via ToolRegistry', async () => {
      const closeTool = registry.get('browser.close_tab');
      expect(closeTool).toBeDefined();

      const tabs = await controller.listTabs();
      const tabToClose = tabs.find((t) => t.id !== 'tab-1');
      if (tabToClose) {
        const result = await closeTool!.execute({ tabId: tabToClose.id });
        expect(result.success).toBe(true);
        expect(result.action).toBe('browser.close_tab');
        expect(result.riskLevel).toBe('R0');
        expect(result.evidence?.closedTabId).toBe(tabToClose.id);
      }
    });
  });
});
