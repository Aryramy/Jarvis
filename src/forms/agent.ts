import { BaseAgent, type BaseAgentOptions } from '../agents/base.js';
import type { AgentContext, ToolResult } from '../tools/types.js';
import type { AgentRunResult } from '../agents/types.js';
import type { BrowserController } from '../browser/controller.js';
import { FormInspector } from './inspector.js';
import type {
  FormField,
  FormFillFieldResult,
  FormFillResult,
  FormSubmitResult,
} from './types.js';

export interface FormAgentOptions extends Partial<BaseAgentOptions> {
  browser: BrowserController;
  inspector?: FormInspector;
}

export class FormAgent extends BaseAgent {
  private browser: BrowserController;
  private inspector: FormInspector;

  constructor(options: FormAgentOptions) {
    super({
      name: options.name ?? 'FormAgent',
      role: options.role ?? 'Semantic Form Filling Specialist',
      systemPrompt:
        options.systemPrompt ??
        'You are an expert form automation agent. Safely inspect and populate draft fields (R1). Never submit without explicit authorization (R2).',
      tools: options.tools,
      gateway: options.gateway,
    });
    this.browser = options.browser;
    this.inspector = options.inspector ?? new FormInspector(options.browser);
  }

  getInspector(): FormInspector {
    return this.inspector;
  }

  async observe(context: AgentContext): Promise<Record<string, unknown>> {
    const inspection = await this.inspector.inspect(context.formSelector as string | undefined);
    return { inspection };
  }

  async decide(
    observation: unknown,
    _context: AgentContext
  ): Promise<Record<string, unknown>> {
    return observation as Record<string, unknown>;
  }

  async verify(actionResult: ToolResult, _context: AgentContext): Promise<boolean> {
    return actionResult.success;
  }

  /**
   * Matches a user-provided data key against a list of discovered form fields.
   */
  private matchField(key: string, fields: FormField[]): FormField | undefined {
    const cleanKey = key.trim().toLowerCase().replace(/[-_]/g, '');

    // 1. Exact match on field.name
    const byName = fields.find((f) => f.name?.toLowerCase().replace(/[-_]/g, '') === cleanKey);
    if (byName) return byName;

    // 2. Exact match on field.id
    const byId = fields.find((f) => f.id.toLowerCase().replace(/[-_]/g, '') === cleanKey);
    if (byId) return byId;

    // 3. Label matching
    const byLabel = fields.find((f) => {
      const cleanLabel = f.label.toLowerCase().replace(/[*:]/g, '').replace(/[-_]/g, '').trim();
      return cleanLabel === cleanKey || cleanLabel.includes(cleanKey) || cleanKey.includes(cleanLabel);
    });
    if (byLabel) return byLabel;

    // 4. Placeholder matching
    const byPlaceholder = fields.find((f) => {
      if (!f.placeholder) return false;
      const cleanPlaceholder = f.placeholder.toLowerCase().replace(/[-_]/g, '').trim();
      return cleanPlaceholder.includes(cleanKey) || cleanKey.includes(cleanPlaceholder);
    });
    if (byPlaceholder) return byPlaceholder;

    return undefined;
  }

  /**
   * Safely populates draft fields on the active form without submitting (R1 risk).
   */
  async fillDraft(
    formData: Record<string, string | boolean | number>,
    formSelector?: string
  ): Promise<FormFillResult> {
    const inspection = await this.inspector.inspect(formSelector);
    if (inspection.forms.length === 0) {
      throw new Error(`[FormAgent] No forms or input fields found on ${inspection.url}.`);
    }

    const form = inspection.forms[0];
    const filledFields: FormFillFieldResult[] = [];
    const fieldsMap = [...form.fields];

    for (const [key, value] of Object.entries(formData)) {
      const field = this.matchField(key, fieldsMap);
      if (!field) {
        filledFields.push({
          fieldId: key,
          label: key,
          type: 'unknown',
          requestedValue: value,
          appliedValue: '',
          success: false,
          error: `No matching form field found for "${key}".`,
        });
        continue;
      }

      try {
        if (field.type === 'select') {
          let selectedVal = String(value);
          if (field.options && field.options.length > 0) {
            const matchedOpt = field.options.find(
              (o) =>
                o.value.toLowerCase() === String(value).toLowerCase() ||
                o.label.toLowerCase().includes(String(value).toLowerCase())
            );
            if (matchedOpt) {
              selectedVal = matchedOpt.value;
            }
          }
          await this.browser.selectOption(field.selector, selectedVal);
          filledFields.push({
            fieldId: field.id,
            label: field.label,
            type: field.type,
            requestedValue: value,
            appliedValue: selectedVal,
            success: true,
          });
        } else if (field.type === 'checkbox') {
          const checkState = Boolean(value);
          await this.browser.check(field.selector, checkState);
          filledFields.push({
            fieldId: field.id,
            label: field.label,
            type: field.type,
            requestedValue: value,
            appliedValue: checkState,
            success: true,
          });
        } else {
          const stringVal = String(value);
          await this.browser.type(field.selector, stringVal, { clearFirst: true });
          filledFields.push({
            fieldId: field.id,
            label: field.label,
            type: field.type,
            requestedValue: value,
            appliedValue: stringVal,
            success: true,
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        filledFields.push({
          fieldId: field.id,
          label: field.label,
          type: field.type,
          requestedValue: value,
          appliedValue: '',
          success: false,
          error: errorMsg,
        });
      }
    }

    // Check unfilled required fields
    const filledSuccessIds = new Set(
      filledFields.filter((f) => f.success).map((f) => f.fieldId)
    );

    const unfilledRequiredFields: string[] = [];
    for (const field of form.fields) {
      if (field.required && !filledSuccessIds.has(field.id) && !filledSuccessIds.has(field.name || '')) {
        // Also verify if it already had a pre-existing value
        if (!field.currentValue) {
          unfilledRequiredFields.push(field.label);
        }
      }
    }

    const canSubmit = unfilledRequiredFields.length === 0;
    const submitBtn = form.submitButtons[0]?.text;

    return {
      formId: form.id,
      filledFields,
      unfilledRequiredFields,
      canSubmit,
      submitButtonText: submitBtn,
      status: canSubmit ? 'WAITING_FOR_USER_AUTHORIZATION' : 'DRAFT_FILLED',
      evidence: {
        fieldsTargeted: Object.keys(formData).length,
        fieldsSucceeded: filledFields.filter((f) => f.success).length,
        requiredComplete: canSubmit,
      },
    };
  }

  /**
   * Submits a form only after verifying explicit user authorization (R2 risk).
   */
  async submit(
    authorizationConfirmed: boolean,
    options?: { formSelector?: string; buttonText?: string }
  ): Promise<FormSubmitResult> {
    const inspection = await this.inspector.inspect(options?.formSelector);
    if (inspection.forms.length === 0) {
      throw new Error(`[FormAgent] No form available to submit.`);
    }

    const form = inspection.forms[0];
    const page = this.browser.getActivePage();
    const previousUrl = page.url();

    // STRICT AUTHORIZATION GATE (R2)
    if (!authorizationConfirmed) {
      return {
        formId: form.id,
        submitted: false,
        authorized: false,
        previousUrl,
        resultingUrl: previousUrl,
        navigationOccurred: false,
        statusText: 'BLOCKED: Form submission requires explicit user authorization (R2 risk tier).',
        evidence: {
          gate: 'AUTHORIZATION_GATE_HELD',
          riskLevel: 'R2',
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Locate submit button
    let buttonTarget = 'button[type="submit"]';
    if (options?.buttonText) {
      buttonTarget = options.buttonText;
    } else if (form.submitButtons.length > 0) {
      buttonTarget = form.submitButtons[0].selector;
    }

    const clickResult = await this.browser.click(buttonTarget, { waitForNavigation: true });
    const resultingUrl = this.browser.getActivePage().url();
    const navigationOccurred = clickResult.navigationOccurred || previousUrl !== resultingUrl;

    return {
      formId: form.id,
      submitted: true,
      authorized: true,
      previousUrl,
      resultingUrl,
      navigationOccurred,
      statusText: 'Form successfully submitted under explicit user authorization.',
      evidence: {
        buttonClicked: buttonTarget,
        previousUrl,
        resultingUrl,
        navigationOccurred,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * High-level run orchestrator for FormAgent with dual voice/display outputs.
   */
  async run(
    instruction: string,
    context: AgentContext = {}
  ): Promise<AgentRunResult<FormFillResult | FormSubmitResult>> {
    const execContext: AgentContext = { ...context, instruction };
    const formData = (execContext.formData as Record<string, string | boolean | number>) ?? {};
    const authorizeSubmit = Boolean(execContext.authorizeSubmit);

    // If instruction asks to submit
    const isSubmitIntent = /\b(submit|send|finalize|confirm registration)\b/i.test(instruction);

    if (isSubmitIntent) {
      const submitResult = await this.submit(authorizeSubmit, {
        formSelector: execContext.formSelector as string | undefined,
      });

      let speechResponse: string;
      let displayResponse: string;

      if (submitResult.submitted) {
        speechResponse = 'I have submitted the form for you.';
        displayResponse = `### Form Submission Confirmed\n\n- **Status:** \`SUBMITTED\`\n- **Target Form:** \`${submitResult.formId}\`\n- **Previous URL:** ${submitResult.previousUrl}\n- **Resulting URL:** ${submitResult.resultingUrl}\n- **Navigation Occurred:** \`${submitResult.navigationOccurred}\``;
      } else {
        speechResponse = 'I have prepared the form, but I need your explicit confirmation before submitting it.';
        displayResponse = `> [!CAUTION]\n> **Action Blocked (R2 Risk Tier):** Form submission causes external side-effects and requires explicit authorization.\n\n${submitResult.statusText}`;
      }

      return {
        success: submitResult.submitted,
        output: submitResult,
        speechResponse,
        displayResponse,
        stepsExecuted: 1,
      };
    }

    // Default flow: fill draft form (R1)
    const fillResult = await this.fillDraft(formData, execContext.formSelector as string | undefined);

    let speechResponse: string;
    const filledCount = fillResult.filledFields.filter((f) => f.success).length;

    if (fillResult.canSubmit) {
      speechResponse = `I've filled out ${filledCount} fields in the form. All required fields are complete. Would you like me to submit it?`;
    } else {
      speechResponse = `I've filled out ${filledCount} fields, but ${fillResult.unfilledRequiredFields.length} required fields are still missing: ${fillResult.unfilledRequiredFields.join(', ')}.`;
    }

    const rows = fillResult.filledFields
      .map(
        (f) =>
          `| ${f.label} | \`${f.type}\` | \`${String(f.appliedValue)}\` | ${f.success ? '✅ Success' : '❌ ' + (f.error || 'Failed')} |`
      )
      .join('\n');

    const warningBanner = fillResult.canSubmit
      ? `> [!NOTE]\n> **Draft Complete (R1):** All fields populated. Form submission is held awaiting explicit authorization (R2).`
      : `> [!WARNING]\n> **Missing Required Fields:** ${fillResult.unfilledRequiredFields.join(', ')}`;

    const displayResponse = `### Form Draft Report (\`${fillResult.formId}\`)\n\n${warningBanner}\n\n| Field | Type | Populated Value | Status |\n|---|---|---|---|\n${rows}`;

    return {
      success: fillResult.filledFields.some((f) => f.success),
      output: fillResult,
      speechResponse,
      displayResponse,
      stepsExecuted: 1,
    };
  }
}
