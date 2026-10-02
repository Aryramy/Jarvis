import type { BrowserController } from '../browser/controller.js';
import type {
  FormInspectionResult,
  DiscoveredForm,
  FormField,
  FormOption,
  FormSubmitButton,
} from './types.js';

export class FormInspector {
  constructor(private browser: BrowserController) {}

  /**
   * Scans the active browser page to discover all forms, inputs, options, and submission buttons.
   */
  async inspect(formSelector?: string): Promise<FormInspectionResult> {
    const page = this.browser.getActivePage();
    const url = page.url();

    const formsData = await page.evaluate((targetSelector) => {
      const getLabelForElement = (el: HTMLElement): string => {
        // 1. Explicit <label for="id">
        if (el.id) {
          const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (labelFor && labelFor.textContent?.trim()) {
            return labelFor.textContent.trim();
          }
        }

        // 2. Ancestor <label>
        const parentLabel = el.closest('label');
        if (parentLabel && parentLabel.textContent?.trim()) {
          // Remove inner element's own text if any
          const clone = parentLabel.cloneNode(true) as HTMLElement;
          const innerControls = clone.querySelectorAll('input, select, textarea, button');
          innerControls.forEach((c) => c.remove());
          const text = clone.textContent?.trim();
          if (text) return text;
        }

        // 3. aria-labelledby
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const labelEl = document.getElementById(labelledBy);
          if (labelEl && labelEl.textContent?.trim()) {
            return labelEl.textContent.trim();
          }
        }

        // 4. aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) {
          return ariaLabel.trim();
        }

        // 5. placeholder
        const placeholder = el.getAttribute('placeholder');
        if (placeholder && placeholder.trim()) {
          return placeholder.trim();
        }

        // 6. title attribute
        const title = el.getAttribute('title');
        if (title && title.trim()) {
          return title.trim();
        }

        // 7. name attribute fallback
        const name = el.getAttribute('name');
        if (name && name.trim()) {
          return name.trim();
        }

        return '';
      };

      const parseField = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, index: number): FormField => {
        const tagName = el.tagName.toLowerCase();
        let fieldType = tagName;
        if (tagName === 'input') {
          fieldType = (el as HTMLInputElement).type || 'text';
        }

        const id = el.id || el.getAttribute('name') || `field-${index}`;
        const name = el.getAttribute('name') || undefined;
        const label = getLabelForElement(el) || id;
        const placeholder = el.getAttribute('placeholder') || undefined;

        const isRequired =
          el.required ||
          el.getAttribute('aria-required') === 'true' ||
          /\*\s*$/.test(label) ||
          label.includes('*');

        const disabled = el.disabled;
        const readOnly = (el as HTMLInputElement).readOnly || false;

        let currentValue: string | boolean = '';
        if (fieldType === 'checkbox' || fieldType === 'radio') {
          currentValue = (el as HTMLInputElement).checked;
        } else {
          currentValue = el.value || '';
        }

        // Extract options if select element
        let options: FormOption[] | undefined;
        if (tagName === 'select') {
          const selectEl = el as HTMLSelectElement;
          options = Array.from(selectEl.options).map((opt) => ({
            label: opt.text.trim(),
            value: opt.value,
            selected: opt.selected,
          }));
        }

        // Build unique resilient selector
        let selector = '';
        if (el.id) {
          selector = `#${CSS.escape(el.id)}`;
        } else if (name) {
          selector = `[name="${CSS.escape(name)}"]`;
        } else {
          selector = `${tagName}[placeholder="${CSS.escape(placeholder || '')}"]`;
        }

        return {
          id,
          name,
          type: fieldType,
          label,
          placeholder,
          required: isRequired,
          disabled,
          readOnly,
          currentValue,
          options,
          selector,
        };
      };

      const parseButtons = (container: HTMLElement): FormSubmitButton[] => {
        const buttons: FormSubmitButton[] = [];
        const btnElements = container.querySelectorAll(
          'button[type="submit"], input[type="submit"], button:not([type])'
        );

        btnElements.forEach((btn) => {
          const btnEl = btn as HTMLElement;
          const text = (btnEl.innerText || (btnEl as HTMLInputElement).value || 'Submit').trim();
          const type = btnEl.getAttribute('type') || 'submit';
          const selector = btnEl.id ? `#${CSS.escape(btnEl.id)}` : `button:has-text("${text}")`;

          buttons.push({
            text,
            type,
            selector,
          });
        });

        return buttons;
      };

      const resultForms: DiscoveredForm[] = [];

      let formNodes: NodeListOf<HTMLFormElement> | HTMLElement[] = [];
      if (targetSelector) {
        const targeted = document.querySelector(targetSelector);
        if (targeted) {
          if (targeted.tagName.toLowerCase() === 'form') {
            formNodes = [targeted as HTMLFormElement];
          } else {
            formNodes = [targeted as HTMLElement];
          }
        }
      } else {
        const domForms = document.querySelectorAll('form');
        if (domForms.length > 0) {
          formNodes = Array.from(domForms);
        }
      }

      // If no <form> tags exist, create a page-level synthetic form
      if (formNodes.length === 0) {
        const allInputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
        );

        if (allInputs.length > 0) {
          const fields = Array.from(allInputs).map((el, i) => parseField(el, i));
          const submitButtons = parseButtons(document.body);

          resultForms.push({
            id: 'page-form-default',
            fields,
            submitButtons,
          });
        }
      } else {
        formNodes.forEach((node, formIdx) => {
          const formEl = node as HTMLFormElement;
          const formId = formEl.id || formEl.name || `form-${formIdx + 1}`;
          const action = formEl.getAttribute('action') || formEl.action || undefined;
          const method = (formEl.getAttribute('method') || formEl.method || 'GET').toUpperCase();

          const inputs = node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
          );

          const fields = Array.from(inputs).map((el, i) => parseField(el, i));
          const submitButtons = parseButtons(node);

          resultForms.push({
            id: formId,
            name: formEl.name || undefined,
            action,
            method,
            fields,
            submitButtons,
          });
        });
      }

      return resultForms;
    }, formSelector);

    const totalFields = formsData.reduce((acc, f) => acc + f.fields.length, 0);
    const requiredFields = formsData.reduce(
      (acc, f) => acc + f.fields.filter((field) => field.required).length,
      0
    );

    return {
      url,
      formsCount: formsData.length,
      totalFieldsCount: totalFields,
      forms: formsData,
      evidence: {
        scannedAt: new Date().toISOString(),
        formsFound: formsData.length,
        requiredFieldsCount: requiredFields,
      },
    };
  }
}
