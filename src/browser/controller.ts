import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright';
import { loadConfig } from '../config/index.js';
import { TabRegistry } from './tabs.js';
import type {
  BrowserLaunchConfig,
  BrowserState,
  NavigationOptions,
  NavigationResult,
  PageContent,
  ExtractedLink,
  ClickOptions,
  ClickResult,
  TypeOptions,
  TypeResult,
  ScrollResult,
  SelectResult,
  CheckResult,
  KeyPressResult,
  TabContext,
  TabInfo,
  CloseTabResult,
} from './types.js';

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private activePage: Page | null = null;
  private tabRegistry = new TabRegistry();
  private exitHandler: (() => void) | null = null;

  /**
   * Initializes the Playwright Chromium instance and default browser context.
   */
  async initialize(config?: BrowserLaunchConfig): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      return;
    }

    const appConfig = loadConfig();
    const isHeadless = config?.headless ?? appConfig.HEADLESS_BROWSER;

    this.browser = await chromium.launch({
      headless: isHeadless,
      slowMo: config?.slowMo !== undefined ? config.slowMo : (isHeadless ? 0 : 50),
    });

    this.context = await this.browser.newContext({
      viewport: config?.viewport !== undefined ? config.viewport : { width: 1280, height: 800 },
      userAgent: config?.userAgent,
      recordVideo: undefined,
    });

    this.activePage = await this.context.newPage();
    this.tabRegistry.register(this.activePage, { description: 'Primary Browser Tab' });

    // Register process exit handler for graceful shutdown
    if (!this.exitHandler) {
      this.exitHandler = () => {
        void this.close();
      };
      process.once('beforeExit', this.exitHandler);
      process.once('SIGINT', this.exitHandler);
      process.once('SIGTERM', this.exitHandler);
    }
  }

  /**
   * Safely closes the browser instance and flushes contexts.
   */
  async close(): Promise<void> {
    this.tabRegistry.clear();

    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // Ignore closing errors on shutdown
      }
      this.context = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore closing errors on shutdown
      }
      this.browser = null;
    }

    this.activePage = null;
  }

  /**
   * Returns current active page or falls back to the latest open page.
   */
  getActivePage(): Page {
    if (!this.context) {
      throw new Error('[BrowserController] Browser is not initialized.');
    }

    const activeEntry = this.tabRegistry.getActive();
    if (activeEntry && !activeEntry.page.isClosed()) {
      this.activePage = activeEntry.page;
      return this.activePage;
    }

    if (!this.activePage || this.activePage.isClosed()) {
      const openPages = this.context.pages().filter((p) => !p.isClosed());
      if (openPages.length > 0) {
        this.activePage = openPages[openPages.length - 1];
      } else {
        throw new Error('[BrowserController] No active or open pages available.');
      }
    }
    return this.activePage;
  }

  /**
   * Creates a new page/tab in the current browser context.
   */
  async newPage(): Promise<Page> {
    if (!this.context) {
      await this.initialize();
    }
    const page = await this.context!.newPage();
    this.tabRegistry.register(page);
    this.activePage = page;
    return page;
  }

  /**
   * Opens a new tab with optional destination URL and associated task context.
   */
  async openTab(url?: string, context?: TabContext): Promise<TabInfo> {
    if (!this.context) {
      await this.initialize();
    }
    const page = await this.context!.newPage();
    const info = this.tabRegistry.register(page, context);
    this.activePage = page;

    if (url) {
      await this.openUrl(url);
      info.url = page.url();
      try {
        info.title = await page.title();
      } catch {
        // ignore title fetch failure
      }
    }

    return info;
  }

  /**
   * Switches the active tab to the specified tab ID and brings it to front.
   */
  async switchTab(tabId: string): Promise<TabInfo> {
    const info = await this.tabRegistry.setActive(tabId);
    const active = this.tabRegistry.getActive();
    if (active) {
      this.activePage = active.page;
    }
    return info;
  }

  /**
   * Closes a tab and automatically switches focus to the next active tab.
   */
  async closeTab(tabId?: string): Promise<CloseTabResult> {
    const result = await this.tabRegistry.closeTab(tabId);
    const active = this.tabRegistry.getActive();
    this.activePage = active ? active.page : null;
    return result;
  }

  /**
   * Lists all open tabs with updated titles, URLs, and context metadata.
   */
  async listTabs(): Promise<TabInfo[]> {
    return this.tabRegistry.listTabs();
  }

  /**
   * Returns the underlying TabRegistry instance.
   */
  getTabRegistry(): TabRegistry {
    return this.tabRegistry;
  }

  /**
   * Returns high-level state of the browser including tab count and active tab ID.
   */
  getState(): BrowserState {
    const isConnected = !!(this.browser && this.browser.isConnected());
    const tabCount = this.context ? this.context.pages().filter((p) => !p.isClosed()).length : 0;
    let activeUrl: string | undefined;
    let activeTabId: string | undefined;

    try {
      const page = this.getActivePage();
      activeUrl = page.url();
      activeTabId = this.tabRegistry.getActive()?.info.id;
    } catch {
      activeUrl = undefined;
    }

    return {
      isInitialized: isConnected,
      tabCount,
      activeUrl,
      activeTabId,
    };
  }

  /**
   * Navigates to a target URL following the Observe -> Act -> Observe -> Verify principle.
   */
  async openUrl(url: string, options: NavigationOptions = {}): Promise<NavigationResult> {
    const page = this.getActivePage();
    const previousUrl = page.url();
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 30000;
    const strategy = options.waitUntil ?? 'domcontentloaded';

    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
    const normalizedUrl = hasScheme ? url : `https://${url}`;

    const response = await page.goto(normalizedUrl, {
      timeout: timeoutMs,
      waitUntil: strategy,
    });

    const loadTimeMs = Date.now() - startTime;
    const resolvedUrl = page.url();
    const pageTitle = await page.title();
    const status = response ? response.status() : 200;

    // Verify: page URL reached and not blank
    const verified = resolvedUrl !== 'about:blank' && status >= 200 && status < 400;

    return {
      url: resolvedUrl,
      title: pageTitle,
      status,
      verified,
      evidence: {
        previousUrl,
        resolvedUrl,
        pageTitle,
        loadTimeMs,
      },
    };
  }

  /**
   * Reads and extracts readable content from the page, sanitizing scripts and styles.
   */
  async readPage(selector?: string): Promise<PageContent> {
    const page = this.getActivePage();

    const data = await page.evaluate((targetSelector) => {
      const root = targetSelector
        ? document.querySelector(targetSelector) ?? document.body
        : document.body;

      if (!root) {
        return { text: '', links: [] };
      }

      // Clone root to avoid modifying live DOM
      const clone = root.cloneNode(true) as HTMLElement;

      // Remove non-content elements
      const elementsToRemove = clone.querySelectorAll(
        'script, style, noscript, svg, iframe, canvas, nav, footer, [aria-hidden="true"]'
      );
      elementsToRemove.forEach((el) => el.remove());

      // Extract text content with normalized whitespace
      const text = (clone.innerText || clone.textContent || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n');

      // Extract links
      const links: Array<{ text: string; href: string }> = [];
      const anchorElements = root.querySelectorAll('a[href]');
      anchorElements.forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        const linkText = (anchor.innerText || anchor.textContent || '').trim();
        const href = anchor.href;
        if (linkText && href && !href.startsWith('javascript:')) {
          links.push({ text: linkText, href });
        }
      });

      return { text, links };
    }, selector);

    const title = await page.title();
    const url = page.url();

    return {
      url,
      title,
      text: data.text,
      links: data.links as ExtractedLink[],
    };
  }

  /**
   * Resolves a clickable locator prioritizing accessible roles and text over raw CSS selectors.
   */
  private async resolveClickableLocator(
    page: Page,
    target: string,
    options?: ClickOptions
  ): Promise<{ locator: Locator; matchedBy: string }> {
    // 1. Explicit role if provided
    if (options?.role) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc = page.getByRole(options.role as any, { name: target, exact: options.exact });
      if ((await loc.count()) > 0) {
        return { locator: loc.first(), matchedBy: `role:${options.role}` };
      }
    }

    // 2. Button role
    const buttonLoc = page.getByRole('button', { name: target, exact: options?.exact ?? false });
    if ((await buttonLoc.count()) > 0) {
      return { locator: buttonLoc.first(), matchedBy: 'role:button' };
    }

    // 3. Link role
    const linkLoc = page.getByRole('link', { name: target, exact: options?.exact ?? false });
    if ((await linkLoc.count()) > 0) {
      return { locator: linkLoc.first(), matchedBy: 'role:link' };
    }

    // 4. Tab role
    const tabLoc = page.getByRole('tab', { name: target, exact: options?.exact ?? false });
    if ((await tabLoc.count()) > 0) {
      return { locator: tabLoc.first(), matchedBy: 'role:tab' };
    }

    // 5. MenuItem role
    const menuLoc = page.getByRole('menuitem', { name: target, exact: options?.exact ?? false });
    if ((await menuLoc.count()) > 0) {
      return { locator: menuLoc.first(), matchedBy: 'role:menuitem' };
    }

    // 6. Accessible text
    const textLoc = page.getByText(target, { exact: options?.exact ?? false });
    if ((await textLoc.count()) > 0) {
      return { locator: textLoc.first(), matchedBy: 'text' };
    }

    // 7. Label or Title
    const labelLoc = page.getByLabel(target, { exact: options?.exact ?? false });
    if ((await labelLoc.count()) > 0) {
      return { locator: labelLoc.first(), matchedBy: 'label' };
    }

    const titleLoc = page.getByTitle(target, { exact: options?.exact ?? false });
    if ((await titleLoc.count()) > 0) {
      return { locator: titleLoc.first(), matchedBy: 'title' };
    }

    // 8. Direct CSS/XPath selector if valid
    try {
      const directLoc = page.locator(target);
      if ((await directLoc.count()) > 0) {
        return { locator: directLoc.first(), matchedBy: 'selector' };
      }
    } catch {
      // Ignore selector syntax error and proceed to fallback
    }

    // 9. Fallback: prioritize role:button or text so Playwright's auto-wait timeout can work
    if (options?.role) {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        locator: page.getByRole(options.role as any, { name: target, exact: options.exact }).first(),
        matchedBy: `fallback:role:${options.role}`,
      };
    }

    return {
      locator: page.getByRole('button', { name: target, exact: options?.exact ?? false }).or(page.getByText(target)).first(),
      matchedBy: 'fallback:roleOrText',
    };
  }

  /**
   * Resolves an input/textbox locator prioritizing accessible label/placeholder over raw selectors.
   */
  private async resolveInputLocator(
    page: Page,
    target: string,
    options?: { exact?: boolean }
  ): Promise<{ locator: Locator; matchedBy: string }> {
    // 1. Label
    const labelLoc = page.getByLabel(target, { exact: options?.exact ?? false });
    if ((await labelLoc.count()) > 0) {
      return { locator: labelLoc.first(), matchedBy: 'label' };
    }

    // 2. Placeholder
    const placeholderLoc = page.getByPlaceholder(target, { exact: options?.exact ?? false });
    if ((await placeholderLoc.count()) > 0) {
      return { locator: placeholderLoc.first(), matchedBy: 'placeholder' };
    }

    // 3. Role textbox
    const textboxLoc = page.getByRole('textbox', { name: target, exact: options?.exact ?? false });
    if ((await textboxLoc.count()) > 0) {
      return { locator: textboxLoc.first(), matchedBy: 'role:textbox' };
    }

    // 4. Role searchbox
    const searchboxLoc = page.getByRole('searchbox', { name: target, exact: options?.exact ?? false });
    if ((await searchboxLoc.count()) > 0) {
      return { locator: searchboxLoc.first(), matchedBy: 'role:searchbox' };
    }

    // 5. Direct selector
    try {
      const directLoc = page.locator(target);
      if ((await directLoc.count()) > 0) {
        return { locator: directLoc.first(), matchedBy: 'selector' };
      }
    } catch {
      // not a selector
    }

    // Fallback: label or placeholder
    return {
      locator: page.getByLabel(target).or(page.getByPlaceholder(target)).first(),
      matchedBy: 'fallback:input',
    };
  }

  /**
   * Performs an accessible click on a target button, link, menuitem, or text.
   */
  async click(target: string, options: ClickOptions = {}): Promise<ClickResult> {
    const page = this.getActivePage();
    const timeoutMs = options.timeoutMs ?? 5000;
    const previousUrl = page.url();

    const { locator, matchedBy } = await this.resolveClickableLocator(page, target, options);

    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    await locator.click({ timeout: timeoutMs });

    if (options.waitForNavigation) {
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
      } catch {
        // Navigation might not occur, continue gracefully
      }
    } else {
      await page.waitForTimeout(200);
    }

    const currentUrl = page.url();
    const navigationOccurred = previousUrl !== currentUrl;

    return {
      target,
      matchedBy,
      previousUrl,
      currentUrl,
      navigationOccurred,
      verified: true,
      evidence: {
        target,
        matchedBy,
        previousUrl,
        currentUrl,
        navigationOccurred,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Types text into a target input, label, or placeholder.
   */
  async type(target: string, text: string, options: TypeOptions = {}): Promise<TypeResult> {
    const page = this.getActivePage();
    const timeoutMs = options.timeoutMs ?? 5000;
    const clearFirst = options.clearFirst ?? true;

    const { locator, matchedBy } = await this.resolveInputLocator(page, target);
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });

    if (clearFirst) {
      await locator.fill('');
    }

    if (options.simulateTyping) {
      await locator.pressSequentially(text, { delay: 25, timeout: timeoutMs });
    } else {
      await locator.fill(text, { timeout: timeoutMs });
    }

    // Verify input value
    const actualValue = await locator.inputValue({ timeout: 1000 }).catch(async () => {
      return (await locator.innerText({ timeout: 1000 })).trim();
    });

    const verified = actualValue.includes(text) || actualValue === text;

    return {
      target,
      matchedBy,
      value: actualValue,
      verified,
      evidence: {
        target,
        matchedBy,
        expectedValue: text,
        actualValue,
        verified,
      },
    };
  }

  /**
   * Clears text from an input or textarea.
   */
  async clear(target: string, timeoutMs: number = 5000): Promise<TypeResult> {
    const page = this.getActivePage();
    const { locator, matchedBy } = await this.resolveInputLocator(page, target);
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    await locator.fill('');

    const actualValue = await locator.inputValue().catch(() => '');
    const verified = actualValue === '';

    return {
      target,
      matchedBy,
      value: actualValue,
      verified,
      evidence: {
        target,
        matchedBy,
        actualValue,
        verified,
      },
    };
  }

  /**
   * Scrolls the page or container in the specified direction.
   */
  async scroll(direction: 'up' | 'down' | 'top' | 'bottom', amount: number = 500): Promise<ScrollResult> {
    const page = this.getActivePage();

    const before = await page.evaluate(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      maxScrollY: Math.max(0, document.body.scrollHeight - window.innerHeight),
    }));

    await page.evaluate(
      ({ dir, amt }) => {
        if (dir === 'down') {
          window.scrollBy({ top: amt, behavior: 'instant' });
        } else if (dir === 'up') {
          window.scrollBy({ top: -amt, behavior: 'instant' });
        } else if (dir === 'top') {
          window.scrollTo({ top: 0, behavior: 'instant' });
        } else if (dir === 'bottom') {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
        }
      },
      { dir: direction, amt: amount }
    );

    await page.waitForTimeout(100);

    const after = await page.evaluate(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      maxScrollY: Math.max(0, document.body.scrollHeight - window.innerHeight),
    }));

    let verified = false;
    if (direction === 'down') {
      verified = after.scrollY > before.scrollY || before.scrollY >= before.maxScrollY;
    } else if (direction === 'up') {
      verified = after.scrollY < before.scrollY || before.scrollY === 0;
    } else if (direction === 'top') {
      verified = after.scrollY === 0;
    } else if (direction === 'bottom') {
      verified = after.scrollY >= after.maxScrollY || after.scrollY > before.scrollY;
    }

    return {
      direction,
      scrollYBefore: before.scrollY,
      scrollYAfter: after.scrollY,
      scrollX: after.scrollX,
      verified,
      evidence: {
        direction,
        scrollYBefore: before.scrollY,
        scrollYAfter: after.scrollY,
        maxScrollY: after.maxScrollY,
        deltaY: after.scrollY - before.scrollY,
      },
    };
  }

  /**
   * Selects an option in a `<select>` dropdown element.
   */
  async selectOption(target: string, value: string | string[], timeoutMs: number = 5000): Promise<SelectResult> {
    const page = this.getActivePage();
    let locator: Locator;
    let matchedBy = 'label';

    const labelLoc = page.getByLabel(target);
    if ((await labelLoc.count()) > 0) {
      locator = labelLoc.first();
    } else {
      locator = page.locator(target).first();
      matchedBy = 'selector';
    }

    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    const selected = await locator.selectOption(value, { timeout: timeoutMs });

    const currentVal = await locator.inputValue().catch(() => '');
    const expectedValues = Array.isArray(value) ? value : [value];
    const verified = selected.length > 0 || expectedValues.includes(currentVal);

    return {
      target,
      matchedBy,
      selectedValues: selected,
      verified,
      evidence: {
        target,
        matchedBy,
        requestedValue: value,
        selectedValues: selected,
        currentInputValue: currentVal,
      },
    };
  }

  /**
   * Toggles a checkbox or selects a radio button.
   */
  async check(target: string, checkState: boolean = true, timeoutMs: number = 5000): Promise<CheckResult> {
    const page = this.getActivePage();
    let locator: Locator;
    let matchedBy = 'role:checkbox';

    const checkboxLoc = page.getByRole('checkbox', { name: target });
    if ((await checkboxLoc.count()) > 0) {
      locator = checkboxLoc.first();
    } else {
      const radioLoc = page.getByRole('radio', { name: target });
      if ((await radioLoc.count()) > 0) {
        locator = radioLoc.first();
        matchedBy = 'role:radio';
      } else {
        const labelLoc = page.getByLabel(target);
        if ((await labelLoc.count()) > 0) {
          locator = labelLoc.first();
          matchedBy = 'label';
        } else {
          locator = page.locator(target).first();
          matchedBy = 'selector';
        }
      }
    }

    await locator.waitFor({ state: 'visible', timeout: timeoutMs });

    if (checkState) {
      await locator.check({ timeout: timeoutMs });
    } else {
      await locator.uncheck({ timeout: timeoutMs });
    }

    const isChecked = await locator.isChecked();
    const verified = isChecked === checkState;

    return {
      target,
      matchedBy,
      checked: isChecked,
      verified,
      evidence: {
        target,
        matchedBy,
        expectedState: checkState,
        actualState: isChecked,
        verified,
      },
    };
  }

  /**
   * Presses a keyboard key on the active page or on a specific target element.
   */
  async pressKey(key: string, target?: string, timeoutMs: number = 5000): Promise<KeyPressResult> {
    const page = this.getActivePage();

    if (target) {
      const { locator, matchedBy } = await this.resolveInputLocator(page, target);
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.press(key, { timeout: timeoutMs });

      return {
        key,
        target,
        verified: true,
        evidence: { key, target, matchedBy },
      };
    } else {
      await page.keyboard.press(key);
      return {
        key,
        verified: true,
        evidence: { key, global: true },
      };
    }
  }
}
