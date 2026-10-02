import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserController } from '../../src/browser/index.js';
import { FormAgent, createFormTools } from '../../src/forms/index.js';
import { ToolRegistry } from '../../src/tools/index.js';

describe('Safe Form Filling Engine & FormAgent (TASK-701)', () => {
  let controller: BrowserController;
  let agent: FormAgent;
  let registry: ToolRegistry;

  const testFormHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Safe Form Filling Test</title>
      </head>
      <body>
        <h1>Applicant Portal</h1>

        <form id="applicant-form" action="#submitted" onsubmit="event.preventDefault(); document.getElementById('msg').textContent = 'Submission Received';">
          <div>
            <label for="applicant-name">Applicant Name *</label>
            <input type="text" id="applicant-name" name="name" required />
          </div>

          <div>
            <label for="applicant-email">Email Address *</label>
            <input type="email" id="applicant-email" name="email" required />
          </div>

          <div>
            <label for="experience-level">Experience Level</label>
            <select id="experience-level" name="experience">
              <option value="junior">Junior (0-2 years)</option>
              <option value="mid">Mid-level (3-5 years)</option>
              <option value="senior">Senior (6+ years)</option>
            </select>
          </div>

          <div>
            <label>
              <input type="checkbox" id="accept-terms" name="agree" required />
              I certify that all details are accurate *
            </label>
          </div>

          <button type="submit" id="btn-submit">Submit Application</button>
        </form>

        <div id="msg">Awaiting Action</div>
      </body>
    </html>
  `;

  const fixtureUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testFormHtml)}`;

  beforeAll(async () => {
    controller = new BrowserController();
    await controller.initialize({ headless: true });
    agent = new FormAgent({ browser: controller });
    registry = new ToolRegistry();
    const tools = createFormTools(agent);
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

  describe('Decoupled Form Filling (R1 Risk Tier)', () => {
    it('should accurately populate draft fields without triggering submission', async () => {
      const fillResult = await agent.fillDraft({
        name: 'Bruce Wayne',
        email: 'bruce@wayne.enterprise',
        experience: 'senior',
        agree: true,
      });

      expect(fillResult.formId).toBe('applicant-form');
      expect(fillResult.filledFields.length).toBe(4);
      expect(fillResult.filledFields.every((f) => f.success)).toBe(true);

      // Verify DOM was populated
      const page = controller.getActivePage();
      const nameVal = await page.locator('#applicant-name').inputValue();
      const emailVal = await page.locator('#applicant-email').inputValue();
      const expVal = await page.locator('#experience-level').inputValue();
      const isChecked = await page.locator('#accept-terms').isChecked();

      expect(nameVal).toBe('Bruce Wayne');
      expect(emailVal).toBe('bruce@wayne.enterprise');
      expect(expVal).toBe('senior');
      expect(isChecked).toBe(true);

      // Form must NOT have been submitted
      const msgText = await page.locator('#msg').innerText();
      expect(msgText).toBe('Awaiting Action');

      // Status should indicate waiting for user authorization
      expect(fillResult.canSubmit).toBe(true);
      expect(fillResult.status).toBe('WAITING_FOR_USER_AUTHORIZATION');
    });

    it('should identify missing required fields when only partial data is filled', async () => {
      // Clear the email field
      await controller.clear('#applicant-email');

      const fillResult = await agent.fillDraft({
        name: 'Clark Kent',
      });

      expect(fillResult.unfilledRequiredFields.length).toBeGreaterThan(0);
      expect(fillResult.canSubmit).toBe(false);
      expect(fillResult.status).toBe('DRAFT_FILLED');
    });
  });

  describe('Authorization-Gated Form Submission (R2 Risk Tier)', () => {
    it('should strictly block submission if authorization is not confirmed', async () => {
      const submitResult = await agent.submit(false);

      expect(submitResult.submitted).toBe(false);
      expect(submitResult.authorized).toBe(false);
      expect(submitResult.statusText).toContain('BLOCKED');
      expect(submitResult.evidence.gate).toBe('AUTHORIZATION_GATE_HELD');

      const page = controller.getActivePage();
      const msgText = await page.locator('#msg').innerText();
      expect(msgText).toBe('Awaiting Action');
    });

    it('should execute submission when authorization is explicitly confirmed', async () => {
      // Re-fill email so form is valid
      await controller.type('#applicant-email', 'clark@dailyplanet.com');

      const submitResult = await agent.submit(true);

      expect(submitResult.submitted).toBe(true);
      expect(submitResult.authorized).toBe(true);
      expect(submitResult.statusText).toContain('successfully submitted');

      const page = controller.getActivePage();
      const msgText = await page.locator('#msg').innerText();
      expect(msgText).toBe('Submission Received');
    });
  });

  describe('FormAgent Workflow & Dual Output Formatting', () => {
    it('should produce distinct conversational speech and formatted display responses on draft fill', async () => {
      const runResult = await agent.run('Fill out the applicant form with my credentials', {
        formData: {
          name: 'Diana Prince',
          email: 'diana@themyscira.gov',
          experience: 'senior',
          agree: true,
        },
      });

      expect(runResult.success).toBe(true);
      // Spoken response must be conversational without markdown tables
      expect(runResult.speechResponse).toContain("I've filled out");
      expect(runResult.speechResponse).not.toContain('| Field |');
      // Display response must contain formatted Markdown table and safety notice
      expect(runResult.displayResponse).toContain('| Field | Type | Populated Value | Status |');
      expect(runResult.displayResponse).toContain('Draft Complete (R1)');
    });

    it('should reject unconfirmed submission in run orchestrator', async () => {
      const runResult = await agent.run('Submit the registration form', {
        authorizeSubmit: false,
      });

      expect(runResult.success).toBe(false);
      expect(runResult.speechResponse).toContain('explicit confirmation');
      expect(runResult.displayResponse).toContain('Action Blocked (R2 Risk Tier)');
    });
  });

  describe('Registered Tool Execution Envelope', () => {
    it('should execute form.fill_draft via ToolRegistry with R1 riskLevel', async () => {
      const fillTool = registry.get('form.fill_draft');
      expect(fillTool).toBeDefined();

      const result = await fillTool!.execute({
        formData: {
          name: 'Barry Allen',
          email: 'barry@ccpd.gov',
        },
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('form.fill_draft');
      expect(result.riskLevel).toBe('R1');
      expect(result.evidence).toBeDefined();
    });

    it('should execute form.submit via ToolRegistry with R2 riskLevel and reject unauthorized requests', async () => {
      const submitTool = registry.get('form.submit');
      expect(submitTool).toBeDefined();

      const result = await submitTool!.execute({
        authorizeSubmit: false,
      });

      expect(result.success).toBe(false);
      expect(result.action).toBe('form.submit');
      expect(result.riskLevel).toBe('R2');
    });
  });
});
