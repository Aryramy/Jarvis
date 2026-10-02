import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserController } from '../../src/browser/index.js';
import { VerificationService, createVerificationTools } from '../../src/verification/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('Real Verification Engine (TASK-901)', () => {
  let controller: BrowserController;
  let verifier: VerificationService;
  let registry: ToolRegistry;
  let tempTestFile: string;

  const testPageHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Order Checkout Page</title>
      </head>
      <body>
        <h1>Billing Details</h1>
        <div id="status-panel">Pending Confirmation</div>
        <input id="voucher-code" value="DISCOUNT20" />
        <button id="btn-confirm" onclick="document.getElementById('status-panel').textContent = 'Order Confirmed #88219';">Confirm Order</button>
        <button id="btn-no-op" onclick="console.log('no-op')">Fake Action</button>
      </body>
    </html>
  `;

  const challengePageHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Security Verification</title>
      </head>
      <body>
        <h1>Please Verify You Are Human</h1>
        <div class="g-recaptcha">Google reCAPTCHA Challenge</div>
        <p>Enter the 6-digit code sent to your phone for Two-Factor Authentication.</p>
      </body>
    </html>
  `;

  const checkoutUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testPageHtml)}`;
  const challengeUrl = `data:text/html;charset=utf-8,${encodeURIComponent(challengePageHtml)}`;

  beforeAll(async () => {
    const tempDir = path.resolve(process.cwd(), 'downloads', 'test_verification');
    fs.mkdirSync(tempDir, { recursive: true });
    tempTestFile = path.join(tempDir, 'receipt.pdf');
    fs.writeFileSync(tempTestFile, 'DUMMY_PDF_RECEIPT_CONTENT', 'utf-8');

    controller = new BrowserController();
    await controller.initialize({ headless: true });
    verifier = new VerificationService(controller);
    registry = new ToolRegistry();
    const tools = createVerificationTools(verifier);
    for (const tool of tools) {
      registry.register(tool);
    }
    await controller.openUrl(checkoutUrl);
  });

  afterAll(async () => {
    if (controller) {
      await controller.close();
    }
    const tempDir = path.dirname(tempTestFile);
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });

  describe('State Snapshot Captures', () => {
    it('should capture comprehensive snapshot of browser state and elements', async () => {
      const snapshot = await verifier.captureSnapshot({
        includeElement: '#voucher-code',
        includeFile: tempTestFile,
      });

      expect(snapshot.browser).toBeDefined();
      expect(snapshot.browser?.title).toBe('Order Checkout Page');
      expect(snapshot.browser?.bodyTextSnippet).toContain('Billing Details');
      expect(snapshot.element).toBeDefined();
      expect(snapshot.element?.value).toBe('DISCOUNT20');
      expect(snapshot.file).toBeDefined();
      expect(snapshot.file?.exists).toBe(true);
      expect(snapshot.file?.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('Declarative Assertion Verifications', () => {
    it('should verify TEXT_PRESENT when confirmation text appears', async () => {
      const pre = await verifier.captureSnapshot();

      // Trigger order confirmation
      await controller.click('#btn-confirm');

      const post = await verifier.captureSnapshot();
      const report = await verifier.verify(pre, post, [
        {
          type: 'TEXT_PRESENT',
          expected: 'Order Confirmed #88219',
          description: 'Ensure order confirmation text is present',
        },
      ]);

      expect(report.verified).toBe(true);
      expect(report.status).toBe('VERIFIED');
      expect(report.checks.length).toBe(1);
      expect(report.checks[0].passed).toBe(true);
    });

    it('should REJECT fake completion when expected text did not appear', async () => {
      const pre = await verifier.captureSnapshot();

      // Click button that does nothing
      await controller.click('#btn-no-op');

      const post = await verifier.captureSnapshot();
      const report = await verifier.verify(pre, post, [
        {
          type: 'TEXT_PRESENT',
          expected: 'Transaction Successful', // Does NOT exist
          description: 'Verify bogus success text',
        },
      ]);

      // Anti-hallucination check: MUST be FAILED
      expect(report.verified).toBe(false);
      expect(report.status).toBe('FAILED');
      expect(report.checks[0].passed).toBe(false);
      expect(report.evidence.allPassed).toBe(false);
    });

    it('should verify FILE_EXISTS_ON_DISK with size > 0', async () => {
      const pre = await verifier.captureSnapshot({ includeFile: tempTestFile });
      const report = await verifier.verify(pre, pre, [
        {
          type: 'FILE_EXISTS_ON_DISK',
          target: tempTestFile,
        },
      ]);

      expect(report.verified).toBe(true);
      expect(report.status).toBe('VERIFIED');
    });

    it('should verify VALUE_EQUALS on interactive input elements', async () => {
      const snapshot = await verifier.captureSnapshot({ includeElement: '#voucher-code' });
      const report = await verifier.verify(snapshot, snapshot, [
        {
          type: 'VALUE_EQUALS',
          target: '#voucher-code',
          expected: 'DISCOUNT20',
        },
      ]);

      expect(report.verified).toBe(true);
      expect(report.checks[0].passed).toBe(true);
    });
  });

  describe('Sensitive Handoff Detection (RULE-022)', () => {
    it('should detect CAPTCHA and 2FA barriers and flag status as WAITING_FOR_USER', async () => {
      // Navigate to challenge page
      await controller.openUrl(challengeUrl);

      const pre = await verifier.captureSnapshot();
      const post = await verifier.captureSnapshot();

      const report = await verifier.verify(pre, post, [
        {
          type: 'URL_CONTAINS',
          expected: 'security',
        },
      ]);

      expect(report.verified).toBe(false);
      expect(report.status).toBe('WAITING_FOR_USER');
      expect(report.humanNotice).toContain('Sensitive barrier encountered');
      expect(report.evidence.sensitiveHandoffDetected).toBe(true);

      // Restore checkout page
      await controller.openUrl(checkoutUrl);
    });
  });

  describe('executeAndVerify Convenience Wrapper', () => {
    it('should wrap actions and verify pre-to-post state automatically', async () => {
      const { actionResult, report } = await verifier.executeAndVerify(
        async () => {
          await controller.type('#voucher-code', 'NEWCODE50');
          return 'voucher_applied';
        },
        [
          {
            type: 'VALUE_EQUALS',
            target: '#voucher-code',
            expected: 'NEWCODE50',
          },
        ],
        { includeElement: '#voucher-code' }
      );

      expect(actionResult).toBe('voucher_applied');
      expect(report.verified).toBe(true);
      expect(report.status).toBe('VERIFIED');
    });
  });

  describe('Registered Tool Execution Envelope', () => {
    it('should execute verification.inspect_state via ToolRegistry with R0 riskLevel', async () => {
      const tool = registry.get('verification.inspect_state');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        targetElement: '#voucher-code',
        filePath: tempTestFile,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('verification.inspect_state');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence?.hasBrowser).toBe(true);
      expect(result.evidence?.hasElement).toBe(true);
      expect(result.evidence?.hasFile).toBe(true);
    });

    it('should execute verification.assert via ToolRegistry', async () => {
      const tool = registry.get('verification.assert');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        assertionType: 'TITLE_CONTAINS',
        expected: 'Checkout',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('verification.assert');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence?.allPassed).toBe(true);
    });
  });
});
