export interface BrowserLaunchConfig {
  headless?: boolean;
  viewport?: { width: number; height: number } | null;
  slowMo?: number;
  downloadsPath?: string;
  userAgent?: string;
}

export interface BrowserState {
  isInitialized: boolean;
  tabCount: number;
  activeUrl?: string;
  activeTitle?: string;
  activeTabId?: string;
}

export type WaitUntilStrategy = 'load' | 'domcontentloaded' | 'commit';

export interface NavigationOptions {
  timeoutMs?: number;
  waitUntil?: WaitUntilStrategy;
}

export interface NavigationResult {
  url: string;
  title: string;
  status: number;
  verified: boolean;
  evidence: {
    previousUrl?: string;
    resolvedUrl: string;
    pageTitle: string;
    loadTimeMs: number;
  };
}

export interface ExtractedLink {
  text: string;
  href: string;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  links: ExtractedLink[];
}

export interface ClickOptions {
  role?: string;
  exact?: boolean;
  timeoutMs?: number;
  waitForNavigation?: boolean;
}

export interface ClickResult {
  target: string;
  matchedBy: string;
  previousUrl: string;
  currentUrl: string;
  navigationOccurred: boolean;
  verified: boolean;
  evidence: Record<string, unknown>;
}

export interface TypeOptions {
  clearFirst?: boolean;
  simulateTyping?: boolean;
  timeoutMs?: number;
}

export interface TypeResult {
  target: string;
  matchedBy: string;
  value: string;
  verified: boolean;
  evidence: Record<string, unknown>;
}

export interface ScrollOptions {
  direction: 'up' | 'down' | 'top' | 'bottom';
  amount?: number;
}

export interface ScrollResult {
  direction: 'up' | 'down' | 'top' | 'bottom';
  scrollYBefore: number;
  scrollYAfter: number;
  scrollX: number;
  verified: boolean;
  evidence: Record<string, unknown>;
}

export interface SelectResult {
  target: string;
  matchedBy: string;
  selectedValues: string[];
  verified: boolean;
  evidence: Record<string, unknown>;
}

export interface CheckResult {
  target: string;
  matchedBy: string;
  checked: boolean;
  verified: boolean;
  evidence: Record<string, unknown>;
}

export interface KeyPressResult {
  key: string;
  target?: string;
  verified: boolean;
  evidence: Record<string, unknown>;
}

export interface TabContext {
  taskId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  isClosed: boolean;
  createdAt: number;
  lastActiveAt: number;
  context?: TabContext;
}

export interface CloseTabResult {
  closedTabId: string;
  activeTabId?: string;
  remainingTabs: number;
  verified: boolean;
}
