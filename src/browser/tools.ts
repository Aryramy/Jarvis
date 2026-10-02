import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.js';
import type { BrowserController } from './controller.js';

export function createBrowserTools(browser: BrowserController): ToolDefinition[] {
  const openUrlTool: ToolDefinition = {
    name: 'browser.open_url',
    description: 'Navigates the browser to a specified website URL and verifies the resulting page.',
    riskLevel: 'R0',
    inputSchema: z.object({
      url: z.string().describe('The destination URL to open (e.g. https://wikipedia.org)'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.openUrl(input.url);
        return {
          success: result.verified,
          action: 'browser.open_url',
          target: input.url,
          data: {
            url: result.url,
            title: result.title,
            status: result.status,
          },
          evidence: result.evidence,
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.open_url',
          target: input.url,
          error: `Navigation failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const readPageTool: ToolDefinition = {
    name: 'browser.read_page',
    description: 'Extracts sanitized text and hyperlinks from the active browser page, excluding scripts, ads, and styles.',
    riskLevel: 'R0',
    inputSchema: z.object({
      selector: z.string().optional().describe('Optional CSS selector to scope content extraction'),
    }),
    execute: async (input) => {
      try {
        const content = await browser.readPage(input.selector);
        return {
          success: true,
          action: 'browser.read_page',
          target: content.url,
          data: {
            url: content.url,
            title: content.title,
            textPreview: content.text.slice(0, 1000),
            totalTextLength: content.text.length,
            linksCount: content.links.length,
          },
          evidence: {
            url: content.url,
            title: content.title,
            linksFound: content.links.length,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.read_page',
          error: `Failed to read page: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const getStateTool: ToolDefinition = {
    name: 'browser.get_state',
    description: 'Retrieves current browser state including active tab, URL, and page title.',
    riskLevel: 'R0',
    inputSchema: z.object({}),
    execute: async () => {
      const state = browser.getState();
      return {
        success: state.isInitialized,
        action: 'browser.get_state',
        data: state,
        evidence: { ...state },
        riskLevel: 'R0',
      };
    },
  };

  const clickTool: ToolDefinition = {
    name: 'browser.click',
    description: 'Clicks an accessible element on the page (button, link, tab, menuitem) by accessible name, label, or selector.',
    riskLevel: 'R0',
    inputSchema: z.object({
      target: z.string().describe('The name, label, text, or selector of the element to click'),
      role: z.string().optional().describe('Optional accessible role (e.g. "button", "link", "tab")'),
      exact: z.boolean().optional().describe('Whether to require exact text match'),
      waitForNavigation: z.boolean().optional().describe('Whether to wait for page navigation after clicking'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.click(input.target, {
          role: input.role,
          exact: input.exact,
          waitForNavigation: input.waitForNavigation,
        });
        return {
          success: result.verified,
          action: 'browser.click',
          target: input.target,
          data: result,
          evidence: result.evidence,
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.click',
          target: input.target,
          error: `Click failed on "${input.target}": ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const typeTool: ToolDefinition = {
    name: 'browser.type',
    description: 'Enters text into an accessible input or textbox by label, placeholder, or selector.',
    riskLevel: 'R1',
    inputSchema: z.object({
      target: z.string().describe('The label, placeholder, or selector of the input field'),
      text: z.string().describe('The text to type into the field'),
      clearFirst: z.boolean().optional().describe('Whether to clear existing text before typing (default: true)'),
      simulateTyping: z.boolean().optional().describe('Whether to simulate realistic keystrokes (default: false)'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.type(input.target, input.text, {
          clearFirst: input.clearFirst,
          simulateTyping: input.simulateTyping,
        });
        return {
          success: result.verified,
          action: 'browser.type',
          target: input.target,
          data: result,
          evidence: result.evidence,
          riskLevel: 'R1',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.type',
          target: input.target,
          error: `Type failed on "${input.target}": ${errorMsg}`,
          riskLevel: 'R1',
        };
      }
    },
  };

  const clearTool: ToolDefinition = {
    name: 'browser.clear',
    description: 'Clears the text content of an input or textarea field.',
    riskLevel: 'R1',
    inputSchema: z.object({
      target: z.string().describe('The label, placeholder, or selector of the input field to clear'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.clear(input.target);
        return {
          success: result.verified,
          action: 'browser.clear',
          target: input.target,
          data: result,
          evidence: result.evidence,
          riskLevel: 'R1',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.clear',
          target: input.target,
          error: `Clear failed on "${input.target}": ${errorMsg}`,
          riskLevel: 'R1',
        };
      }
    },
  };

  const scrollTool: ToolDefinition = {
    name: 'browser.scroll',
    description: 'Scrolls the active browser page in a specified direction ("up", "down", "top", "bottom").',
    riskLevel: 'R0',
    inputSchema: z.object({
      direction: z.enum(['up', 'down', 'top', 'bottom']).describe('The scroll direction'),
      amount: z.number().optional().describe('Pixel distance to scroll (for up/down, default: 500)'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.scroll(input.direction, input.amount);
        return {
          success: result.verified,
          action: 'browser.scroll',
          data: result,
          evidence: result.evidence,
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.scroll',
          error: `Scroll failed: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const selectTool: ToolDefinition = {
    name: 'browser.select',
    description: 'Selects an option from a dropdown `<select>` element by label or selector.',
    riskLevel: 'R1',
    inputSchema: z.object({
      target: z.string().describe('The label or selector of the dropdown select element'),
      value: z.string().describe('The option value or visible text to select'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.selectOption(input.target, input.value);
        return {
          success: result.verified,
          action: 'browser.select',
          target: input.target,
          data: result,
          evidence: result.evidence,
          riskLevel: 'R1',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.select',
          target: input.target,
          error: `Select failed on "${input.target}": ${errorMsg}`,
          riskLevel: 'R1',
        };
      }
    },
  };

  const checkTool: ToolDefinition = {
    name: 'browser.check',
    description: 'Checks or unchecks a checkbox or radio button by accessible name or label.',
    riskLevel: 'R1',
    inputSchema: z.object({
      target: z.string().describe('The accessible name or label of the checkbox/radio button'),
      checked: z.boolean().optional().describe('True to check, false to uncheck (default: true)'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.check(input.target, input.checked ?? true);
        return {
          success: result.verified,
          action: 'browser.check',
          target: input.target,
          data: result,
          evidence: result.evidence,
          riskLevel: 'R1',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.check',
          target: input.target,
          error: `Check failed on "${input.target}": ${errorMsg}`,
          riskLevel: 'R1',
        };
      }
    },
  };

  const pressKeyTool: ToolDefinition = {
    name: 'browser.press_key',
    description: 'Sends a keyboard key press (e.g. "Enter", "Tab", "Escape", "ArrowDown") to the active page or element.',
    riskLevel: 'R0',
    inputSchema: z.object({
      key: z.string().describe('The key to press (e.g. "Enter", "Escape", "Tab")'),
      target: z.string().optional().describe('Optional target element to focus before pressing key'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.pressKey(input.key, input.target);
        return {
          success: result.verified,
          action: 'browser.press_key',
          target: input.target ?? 'global',
          data: result,
          evidence: result.evidence,
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.press_key',
          target: input.target ?? 'global',
          error: `Key press failed for "${input.key}": ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const openTabTool: ToolDefinition = {
    name: 'browser.open_tab',
    description: 'Opens a new browser tab with optional URL and task context metadata.',
    riskLevel: 'R0',
    inputSchema: z.object({
      url: z.string().optional().describe('Optional destination URL to open in the new tab'),
      taskId: z.string().optional().describe('Optional task or workflow ID associating this tab'),
      description: z.string().optional().describe('Purpose or description of the tab'),
    }),
    execute: async (input) => {
      try {
        const tabInfo = await browser.openTab(input.url, {
          taskId: input.taskId,
          description: input.description,
        });
        return {
          success: true,
          action: 'browser.open_tab',
          target: tabInfo.id,
          data: tabInfo,
          evidence: {
            tabId: tabInfo.id,
            url: tabInfo.url,
            title: tabInfo.title,
            taskId: input.taskId,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.open_tab',
          error: `Failed to open new tab: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const switchTabTool: ToolDefinition = {
    name: 'browser.switch_tab',
    description: 'Switches the active browser focus to a specific tab ID.',
    riskLevel: 'R0',
    inputSchema: z.object({
      tabId: z.string().describe('The ID of the tab to switch to (e.g. "tab-1")'),
    }),
    execute: async (input) => {
      try {
        const tabInfo = await browser.switchTab(input.tabId);
        return {
          success: true,
          action: 'browser.switch_tab',
          target: input.tabId,
          data: tabInfo,
          evidence: {
            activeTabId: tabInfo.id,
            url: tabInfo.url,
            title: tabInfo.title,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.switch_tab',
          target: input.tabId,
          error: `Failed to switch to tab "${input.tabId}": ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const closeTabTool: ToolDefinition = {
    name: 'browser.close_tab',
    description: 'Closes a specified tab ID or the current active tab.',
    riskLevel: 'R0',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional ID of tab to close; defaults to active tab'),
    }),
    execute: async (input) => {
      try {
        const result = await browser.closeTab(input.tabId);
        return {
          success: result.verified,
          action: 'browser.close_tab',
          target: result.closedTabId,
          data: result,
          evidence: {
            closedTabId: result.closedTabId,
            newActiveTabId: result.activeTabId,
            remainingTabs: result.remainingTabs,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.close_tab',
          target: input.tabId ?? 'active',
          error: `Failed to close tab: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  const listTabsTool: ToolDefinition = {
    name: 'browser.list_tabs',
    description: 'Lists all open browser tabs with their titles, URLs, active state, and task context.',
    riskLevel: 'R0',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const tabs = await browser.listTabs();
        return {
          success: true,
          action: 'browser.list_tabs',
          data: tabs,
          evidence: {
            tabCount: tabs.length,
            activeTabId: tabs.find((t) => t.isActive)?.id,
          },
          riskLevel: 'R0',
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          action: 'browser.list_tabs',
          error: `Failed to list tabs: ${errorMsg}`,
          riskLevel: 'R0',
        };
      }
    },
  };

  return [
    openUrlTool,
    readPageTool,
    getStateTool,
    clickTool,
    typeTool,
    clearTool,
    scrollTool,
    selectTool,
    checkTool,
    pressKeyTool,
    openTabTool,
    switchTabTool,
    closeTabTool,
    listTabsTool,
  ];
}
