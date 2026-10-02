import type { Page } from 'playwright';
import type { TabContext, TabInfo, CloseTabResult } from './types.js';

interface TabEntry {
  page: Page;
  info: TabInfo;
}

export class TabRegistry {
  private tabs: Map<string, TabEntry> = new Map();
  private activeTabId: string | null = null;
  private tabCounter = 0;

  /**
   * Registers a new Playwright page into the tab registry.
   */
  register(page: Page, context?: TabContext): TabInfo {
    this.tabCounter++;
    const id = `tab-${this.tabCounter}`;
    const now = Date.now();

    const info: TabInfo = {
      id,
      url: page.url() || 'about:blank',
      title: 'New Tab',
      isActive: true,
      isClosed: false,
      createdAt: now,
      lastActiveAt: now,
      context,
    };

    // Mark previous active tab as inactive
    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      this.tabs.get(this.activeTabId)!.info.isActive = false;
    }

    const entry: TabEntry = { page, info };
    this.tabs.set(id, entry);
    this.activeTabId = id;

    // Attach event listeners for automatic lifecycle synchronization
    page.once('close', () => {
      this.handlePageClosed(id);
    });

    return { ...info };
  }

  /**
   * Internal handler when a Playwright page closes.
   */
  private handlePageClosed(id: string): void {
    const entry = this.tabs.get(id);
    if (!entry) return;

    entry.info.isClosed = true;
    entry.info.isActive = false;

    // If the closed tab was active, automatically pick the most recently active open tab
    if (this.activeTabId === id) {
      this.activeTabId = null;
      let latestTab: TabEntry | null = null;

      for (const t of this.tabs.values()) {
        if (!t.info.isClosed && !t.page.isClosed()) {
          if (!latestTab || t.info.lastActiveAt > latestTab.info.lastActiveAt) {
            latestTab = t;
          }
        }
      }

      if (latestTab) {
        latestTab.info.isActive = true;
        this.activeTabId = latestTab.info.id;
      }
    }
  }

  /**
   * Gets tab entry by unique ID.
   */
  get(tabId: string): TabEntry | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * Gets tab entry by Playwright Page instance.
   */
  getByPage(page: Page): TabEntry | undefined {
    for (const entry of this.tabs.values()) {
      if (entry.page === page) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Returns current active tab entry.
   */
  getActive(): TabEntry | null {
    if (!this.activeTabId) return null;
    const entry = this.tabs.get(this.activeTabId);
    if (!entry || entry.info.isClosed || entry.page.isClosed()) {
      return null;
    }
    return entry;
  }

  /**
   * Switches active tab to the specified tab ID and brings page to front.
   */
  async setActive(tabId: string): Promise<TabInfo> {
    const entry = this.tabs.get(tabId);
    if (!entry) {
      throw new Error(`[TabRegistry] Tab "${tabId}" not found.`);
    }

    if (entry.info.isClosed || entry.page.isClosed()) {
      throw new Error(`[TabRegistry] Cannot activate closed tab "${tabId}".`);
    }

    // Deactivate previous active tab
    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      this.tabs.get(this.activeTabId)!.info.isActive = false;
    }

    entry.info.isActive = true;
    entry.info.lastActiveAt = Date.now();
    this.activeTabId = tabId;

    await entry.page.bringToFront();

    // Refresh url & title
    entry.info.url = entry.page.url();
    try {
      entry.info.title = await entry.page.title();
    } catch {
      // Ignore if title lookup is interrupted
    }

    return { ...entry.info };
  }

  /**
   * Closes a tab and switches active tab to the remaining active tab.
   */
  async closeTab(tabId?: string): Promise<CloseTabResult> {
    const targetId = tabId ?? this.activeTabId;
    if (!targetId) {
      throw new Error('[TabRegistry] No active tab to close.');
    }

    const entry = this.tabs.get(targetId);
    if (!entry) {
      throw new Error(`[TabRegistry] Tab "${targetId}" not found.`);
    }

    if (!entry.page.isClosed()) {
      await entry.page.close();
    }

    this.handlePageClosed(targetId);

    const openCount = Array.from(this.tabs.values()).filter(
      (t) => !t.info.isClosed && !t.page.isClosed()
    ).length;

    return {
      closedTabId: targetId,
      activeTabId: this.activeTabId ?? undefined,
      remainingTabs: openCount,
      verified: true,
    };
  }

  /**
   * Returns a snapshot of all tracked tabs with updated titles and URLs.
   */
  async listTabs(): Promise<TabInfo[]> {
    const result: TabInfo[] = [];

    for (const entry of this.tabs.values()) {
      if (!entry.info.isClosed && !entry.page.isClosed()) {
        entry.info.url = entry.page.url();
        try {
          entry.info.title = await entry.page.title();
        } catch {
          // preserve existing title
        }
        result.push({ ...entry.info });
      }
    }

    return result;
  }

  /**
   * Associates task context with a tab.
   */
  updateContext(tabId: string, context: TabContext): TabInfo {
    const entry = this.tabs.get(tabId);
    if (!entry) {
      throw new Error(`[TabRegistry] Tab "${tabId}" not found.`);
    }

    entry.info.context = {
      ...entry.info.context,
      ...context,
      metadata: {
        ...entry.info.context?.metadata,
        ...context.metadata,
      },
    };

    return { ...entry.info };
  }

  /**
   * Clears all tab records on shutdown.
   */
  clear(): void {
    this.tabs.clear();
    this.activeTabId = null;
  }
}
