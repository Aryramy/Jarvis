import fs from 'node:fs';
import path from 'node:path';
import type { BrowserController } from '../browser/controller.js';
import type {
  AssertionType,
  VerificationAssertion,
  StateSnapshot,
  VerificationCheck,
  VerificationReport,
  VerificationStatus,
  SnapshotOptions,
} from './types.js';

export class VerificationService {
  constructor(private browser?: BrowserController) {}

  /**
   * Captures a comprehensive state snapshot of browser, DOM elements, and local filesystem.
   */
  async captureSnapshot(options: SnapshotOptions = {}): Promise<StateSnapshot> {
    const timestamp = Date.now();
    let browserState: StateSnapshot['browser'] | undefined;
    let elementState: StateSnapshot['element'] | undefined;
    let fileState: StateSnapshot['file'] | undefined;

    if (this.browser && this.browser.getState().isInitialized) {
      try {
        const page = this.browser.getActivePage();
        const url = page.url();
        const title = await page.title();
        const state = this.browser.getState();

        // Sample text content from page body
        const bodyText = await page.evaluate(() => {
          return document.body ? (document.body.innerText || document.body.textContent || '').slice(0, 4000) : '';
        });

        browserState = {
          url,
          title,
          activeTabId: state.activeTabId,
          tabCount: state.tabCount,
          bodyTextSnippet: bodyText,
        };

        if (options.includeElement) {
          const loc = page.locator(options.includeElement).first();
          const count = await loc.count();
          if (count > 0) {
            const visible = await loc.isVisible().catch(() => false);
            const value = await loc.inputValue().catch(async () => {
              return (await loc.innerText().catch(() => '')).trim();
            });
            const text = (await loc.innerText().catch(() => '')).trim();

            elementState = {
              target: options.includeElement,
              exists: true,
              visible,
              value,
              text,
            };
          } else {
            elementState = {
              target: options.includeElement,
              exists: false,
              visible: false,
            };
          }
        }
      } catch {
        // Page might be closed or navigating
      }
    }

    if (options.includeFile) {
      const resolved = path.resolve(options.includeFile);
      const exists = fs.existsSync(resolved);
      let sizeBytes = 0;
      if (exists) {
        try {
          sizeBytes = fs.statSync(resolved).size;
        } catch {
          sizeBytes = 0;
        }
      }
      fileState = {
        path: resolved,
        exists,
        sizeBytes,
      };
    }

    return {
      timestamp,
      browser: browserState,
      element: elementState,
      file: fileState,
    };
  }

  /**
   * Scans a snapshot for authentication, CAPTCHA, or 2FA barriers requiring sensitive handoff.
   */
  checkSensitiveHandoff(snapshot: StateSnapshot): { detected: boolean; reason?: string } {
    if (!snapshot.browser) {
      return { detected: false };
    }

    const text = (snapshot.browser.bodyTextSnippet + ' ' + snapshot.browser.title).toLowerCase();

    const patterns = [
      { trigger: 'recaptcha', msg: 'Google reCAPTCHA challenge detected.' },
      { trigger: 'hcaptcha', msg: 'hCaptcha challenge detected.' },
      { trigger: 'cf-turnstile', msg: 'Cloudflare Turnstile verification challenge detected.' },
      { trigger: 'verify you are human', msg: 'Anti-bot human verification challenge detected.' },
      { trigger: 'security code', msg: 'Security code or verification challenge detected.' },
      { trigger: 'one-time password', msg: 'One-Time Password (OTP) verification required.' },
      { trigger: 'two-factor authentication', msg: 'Two-Factor Authentication (2FA) prompt encountered.' },
      { trigger: 'enter the 6-digit code', msg: 'Multi-factor authentication code required.' },
    ];

    for (const p of patterns) {
      if (text.includes(p.trigger)) {
        return { detected: true, reason: p.msg };
      }
    }

    return { detected: false };
  }

  /**
   * Evaluates a single assertion against pre- and post-state snapshots.
   */
  private async evaluateAssertion(
    assertion: VerificationAssertion,
    pre: StateSnapshot,
    post: StateSnapshot
  ): Promise<VerificationCheck> {
    const type: AssertionType = assertion.type;
    const desc = assertion.description ?? `Assertion: ${type}`;
    let passed = false;
    let actual: unknown = null;
    let message = '';

    switch (type) {
      case 'URL_CHANGED': {
        const preUrl = pre.browser?.url ?? '';
        const postUrl = post.browser?.url ?? '';
        passed = preUrl !== postUrl && postUrl.length > 0;
        actual = { preUrl, postUrl };
        message = passed
          ? `URL successfully transitioned from "${preUrl}" to "${postUrl}".`
          : `URL failed to change; remained "${preUrl}".`;
        break;
      }

      case 'URL_CONTAINS': {
        const expected = String(assertion.expected);
        const postUrl = post.browser?.url ?? '';
        passed = postUrl.includes(expected);
        actual = postUrl;
        message = passed
          ? `URL contains expected token "${expected}".`
          : `URL "${postUrl}" does not contain expected token "${expected}".`;
        break;
      }

      case 'URL_EQUALS': {
        const expected = String(assertion.expected);
        const postUrl = post.browser?.url ?? '';
        passed = postUrl === expected;
        actual = postUrl;
        message = passed
          ? `URL exactly matches expected URL "${expected}".`
          : `URL "${postUrl}" does not match expected URL "${expected}".`;
        break;
      }

      case 'TITLE_CONTAINS': {
        const expected = String(assertion.expected);
        const title = post.browser?.title ?? '';
        passed = title.toLowerCase().includes(expected.toLowerCase());
        actual = title;
        message = passed
          ? `Page title contains "${expected}".`
          : `Page title "${title}" does not contain expected text "${expected}".`;
        break;
      }

      case 'ELEMENT_VISIBLE': {
        let isVis = post.element?.visible ?? false;
        // If element target was not in snapshot, check live page
        if (!post.element && this.browser && assertion.target) {
          try {
            isVis = await this.browser.getActivePage().locator(assertion.target).first().isVisible();
          } catch {
            isVis = false;
          }
        }
        passed = isVis;
        actual = isVis;
        message = passed
          ? `Element "${assertion.target ?? post.element?.target}" is visible.`
          : `Element "${assertion.target ?? post.element?.target}" is not visible or absent.`;
        break;
      }

      case 'ELEMENT_HIDDEN': {
        let isVis = post.element?.visible ?? false;
        if (!post.element && this.browser && assertion.target) {
          try {
            isVis = await this.browser.getActivePage().locator(assertion.target).first().isVisible();
          } catch {
            isVis = false;
          }
        }
        passed = !isVis;
        actual = !isVis;
        message = passed
          ? `Element "${assertion.target ?? post.element?.target}" is hidden or removed.`
          : `Element "${assertion.target ?? post.element?.target}" is still visible.`;
        break;
      }

      case 'TEXT_PRESENT': {
        const expected = String(assertion.expected);
        let found = (post.browser?.bodyTextSnippet ?? '').toLowerCase().includes(expected.toLowerCase());

        if (!found && this.browser) {
          try {
            const count = await this.browser.getActivePage().getByText(expected).count();
            found = count > 0;
          } catch {
            found = false;
          }
        }

        passed = found;
        actual = found;
        message = passed
          ? `Expected text "${expected}" was confirmed present in page content.`
          : `Expected text "${expected}" was NOT found in page content.`;
        break;
      }

      case 'TEXT_ABSENT': {
        const expected = String(assertion.expected);
        let found = (post.browser?.bodyTextSnippet ?? '').toLowerCase().includes(expected.toLowerCase());
        if (found && this.browser) {
          try {
            const count = await this.browser.getActivePage().getByText(expected).count();
            found = count > 0;
          } catch {
            found = false;
          }
        }
        passed = !found;
        actual = !found;
        message = passed
          ? `Text "${expected}" is absent from page.`
          : `Text "${expected}" is still present in page.`;
        break;
      }

      case 'VALUE_EQUALS': {
        const expected = String(assertion.expected);
        let currentVal = String(post.element?.value ?? '');

        if (!post.element && this.browser && assertion.target) {
          try {
            currentVal = await this.browser.getActivePage().locator(assertion.target).first().inputValue();
          } catch {
            currentVal = '';
          }
        }

        passed = currentVal === expected;
        actual = currentVal;
        message = passed
          ? `Field value correctly matches "${expected}".`
          : `Field value "${currentVal}" does not match expected value "${expected}".`;
        break;
      }

      case 'FILE_EXISTS_ON_DISK': {
        const targetPath = assertion.target ?? post.file?.path;
        let exists = false;
        let sizeBytes = 0;

        if (targetPath) {
          const resolved = path.resolve(targetPath);
          exists = fs.existsSync(resolved);
          if (exists) {
            sizeBytes = fs.statSync(resolved).size;
          }
        } else if (post.file) {
          exists = post.file.exists;
          sizeBytes = post.file.sizeBytes;
        }

        passed = exists && sizeBytes > 0;
        actual = { exists, sizeBytes };
        message = passed
          ? `File verified on disk (${sizeBytes} bytes).`
          : `File verification failed: exists=${exists}, sizeBytes=${sizeBytes}.`;
        break;
      }

      case 'STATE_MUTATED': {
        if (!pre.browser && !post.browser) {
          passed = true;
          actual = { nonBrowserEnvironment: true };
          message = 'State mutation verified (non-browser execution context).';
          break;
        }
        const preSnippet = pre.browser?.bodyTextSnippet ?? '';
        const postSnippet = post.browser?.bodyTextSnippet ?? '';
        const urlChanged = (pre.browser?.url ?? '') !== (post.browser?.url ?? '');
        const textChanged = preSnippet !== postSnippet;
        passed = urlChanged || textChanged;
        actual = { urlChanged, textChanged };
        message = passed
          ? 'State mutation verified (URL or DOM content changed).'
          : 'State failed to mutate: no changes detected between pre and post state.';
        break;
      }

      default: {
        passed = false;
        message = `Unknown assertion type: "${type}".`;
      }
    }

    return {
      assertionType: type,
      description: desc,
      expected: assertion.expected ?? true,
      actual,
      passed,
      message,
    };
  }

  /**
   * Verifies pre- and post-action snapshots against a set of declarative assertions.
   */
  async verify(
    pre: StateSnapshot,
    post: StateSnapshot,
    assertions: VerificationAssertion[]
  ): Promise<VerificationReport> {
    const startTime = pre.timestamp;
    const durationMs = post.timestamp - startTime;

    // Check for sensitive authentication / anti-bot barriers
    const handoff = this.checkSensitiveHandoff(post);
    if (handoff.detected) {
      return {
        verified: false,
        status: 'WAITING_FOR_USER',
        checks: [],
        preSnapshot: pre,
        postSnapshot: post,
        durationMs,
        humanNotice: `Sensitive barrier encountered: ${handoff.reason}. Please perform manual authentication and prompt JARVIS to resume.`,
        evidence: {
          passedChecksCount: 0,
          totalChecksCount: assertions.length,
          allPassed: false,
          sensitiveHandoffDetected: true,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const checks: VerificationCheck[] = [];
    for (const assertion of assertions) {
      const check = await this.evaluateAssertion(assertion, pre, post);
      checks.push(check);
    }

    const allPassed = checks.length > 0 && checks.every((c) => c.passed);
    const passedCount = checks.filter((c) => c.passed).length;
    const status: VerificationStatus = allPassed ? 'VERIFIED' : 'FAILED';

    return {
      verified: allPassed,
      status,
      checks,
      preSnapshot: pre,
      postSnapshot: post,
      durationMs,
      evidence: {
        passedChecksCount: passedCount,
        totalChecksCount: checks.length,
        allPassed,
        sensitiveHandoffDetected: false,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Automatically executes an asynchronous action enclosed in pre- and post-state verification.
   */
  async executeAndVerify<T>(
    action: () => Promise<T>,
    assertions: VerificationAssertion[],
    options: SnapshotOptions & { settleMs?: number } = {}
  ): Promise<{ actionResult: T; report: VerificationReport }> {
    const preSnapshot = await this.captureSnapshot(options);

    const actionResult = await action();

    if (options.settleMs) {
      await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    } else if (this.browser && this.browser.getState().isInitialized) {
      await this.browser.getActivePage().waitForTimeout(150);
    }

    const postSnapshot = await this.captureSnapshot(options);
    const report = await this.verify(preSnapshot, postSnapshot, assertions);

    return {
      actionResult,
      report,
    };
  }

  /**
   * Evaluates assertions directly against current state snapshot.
   */
  async evaluateAssertions(
    assertions: VerificationAssertion[],
    options: SnapshotOptions = {}
  ): Promise<VerificationReport> {
    const postSnapshot = await this.captureSnapshot(options);
    const preSnapshot: StateSnapshot = {
      ...postSnapshot,
      timestamp: postSnapshot.timestamp - 1,
    };
    return this.verify(preSnapshot, postSnapshot, assertions);
  }
}
