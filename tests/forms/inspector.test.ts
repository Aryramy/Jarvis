import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserController } from '../../src/browser/index.js';
import { FormInspector, createFormTools } from '../../src/forms/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('Semantic Form Understanding & Inspector (TASK-601)', () => {
  let controller: BrowserController;
  let inspector: FormInspector;
  let registry: ToolRegistry;

  const complexFormHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Comprehensive Registration Form</title>
      </head>
      <body>
        <h1>Create Your Account</h1>

        <form id="user-registration" action="/api/v1/users" method="POST">
          <div class="field-group">
            <label for="full-name">Full Name *</label>
            <input type="text" id="full-name" name="fullname" required value="Tony Stark" />
          </div>

          <div class="field-group">
            <label for="user-email">Email Address</label>
            <input type="email" id="user-email" name="email" placeholder="you@domain.com" required />
          </div>

          <div class="field-group">
            <label>
              Password
              <input type="password" name="password" placeholder="At least 12 characters" />
            </label>
          </div>

          <div class="field-group">
            <label for="account-tier">Account Tier</label>
            <select id="account-tier" name="tier">
              <option value="free">Free Community</option>
              <option value="pro" selected>Pro Developer</option>
              <option value="enterprise">Enterprise Shield</option>
            </select>
          </div>

          <div class="field-group">
            <label for="user-bio">Profile Bio</label>
            <textarea id="user-bio" name="bio" placeholder="Tell us about yourself"></textarea>
          </div>

          <div class="field-group">
            <label>
              <input type="checkbox" id="terms-agree" name="terms" aria-required="true" />
              I accept the terms and conditions
            </label>
          </div>

          <div class="actions">
            <button type="submit" id="btn-submit-reg">Complete Registration</button>
            <button type="reset" id="btn-reset-reg">Clear All</button>
          </div>
        </form>

        <section id="feedback-section">
          <h2>Quick Feedback</h2>
          <label for="quick-comment">Leave a Note</label>
          <input type="text" id="quick-comment" placeholder="Quick comment here" />
          <button id="send-quick-btn">Post Feedback</button>
        </section>
      </body>
    </html>
  `;

  const fixtureUrl = `data:text/html;charset=utf-8,${encodeURIComponent(complexFormHtml)}`;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.initialize({ headless: true });
    inspector = new FormInspector(controller);
    registry = new ToolRegistry();
    const tools = createFormTools(inspector);
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

  describe('FormInspector Engine', () => {
    it('should scan and discover forms and fields with semantic metadata', async () => {
      const result = await inspector.inspect();

      expect(result.formsCount).toBeGreaterThanOrEqual(1);
      expect(result.totalFieldsCount).toBeGreaterThanOrEqual(6);

      const regForm = result.forms.find((f) => f.id === 'user-registration');
      expect(regForm).toBeDefined();
      expect(regForm?.action).toContain('/api/v1/users');
      expect(regForm?.method).toBe('POST');

      // 1. Text input with explicit label and required attribute
      const nameField = regForm?.fields.find((f) => f.name === 'fullname');
      expect(nameField).toBeDefined();
      expect(nameField?.type).toBe('text');
      expect(nameField?.label).toContain('Full Name');
      expect(nameField?.required).toBe(true);
      expect(nameField?.currentValue).toBe('Tony Stark');

      // 2. Email input
      const emailField = regForm?.fields.find((f) => f.name === 'email');
      expect(emailField).toBeDefined();
      expect(emailField?.type).toBe('email');
      expect(emailField?.label).toBe('Email Address');
      expect(emailField?.placeholder).toBe('you@domain.com');
      expect(emailField?.required).toBe(true);

      // 3. Password input with ancestor label
      const passwordField = regForm?.fields.find((f) => f.name === 'password');
      expect(passwordField).toBeDefined();
      expect(passwordField?.type).toBe('password');
      expect(passwordField?.label).toBe('Password');

      // 4. Select dropdown with options
      const tierField = regForm?.fields.find((f) => f.name === 'tier');
      expect(tierField).toBeDefined();
      expect(tierField?.type).toBe('select');
      expect(tierField?.options?.length).toBe(3);
      expect(tierField?.options?.find((o) => o.value === 'pro')?.selected).toBe(true);

      // 5. Textarea
      const bioField = regForm?.fields.find((f) => f.name === 'bio');
      expect(bioField).toBeDefined();
      expect(bioField?.type).toBe('textarea');
      expect(bioField?.label).toBe('Profile Bio');

      // 6. Checkbox with aria-required
      const termsField = regForm?.fields.find((f) => f.name === 'terms');
      expect(termsField).toBeDefined();
      expect(termsField?.type).toBe('checkbox');
      expect(termsField?.required).toBe(true);
      expect(termsField?.currentValue).toBe(false);

      // 7. Submit buttons
      expect(regForm?.submitButtons.length).toBeGreaterThanOrEqual(1);
      const submitBtn = regForm?.submitButtons.find((b) => b.text === 'Complete Registration');
      expect(submitBtn).toBeDefined();
    });

    it('should scope form inspection when a selector is provided', async () => {
      const result = await inspector.inspect('#user-registration');

      expect(result.formsCount).toBe(1);
      expect(result.forms[0].id).toBe('user-registration');
    });

    it('should correctly capture required fields in evidence metrics', async () => {
      const result = await inspector.inspect();

      expect(result.evidence.formsFound).toBeGreaterThanOrEqual(1);
      // fullname, email, and terms are required
      expect(result.evidence.requiredFieldsCount).toBeGreaterThanOrEqual(3);
      expect(result.evidence.scannedAt).toBeDefined();
    });
  });

  describe('Registered Tool Execution Envelope', () => {
    it('should execute form.inspect via ToolRegistry with R0 riskLevel and evidence', async () => {
      const tool = registry.get('form.inspect');
      expect(tool).toBeDefined();

      const result = await tool!.execute({
        formSelector: '#user-registration',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('form.inspect');
      expect(result.riskLevel).toBe('R0');
      expect(result.evidence).toMatchObject({
        formsCount: 1,
      });
      expect(result.evidence?.totalFieldsCount).toBeGreaterThanOrEqual(6);
    });
  });
});
