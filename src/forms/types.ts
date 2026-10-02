export interface FormOption {
  label: string;
  value: string;
  selected: boolean;
}

export interface FormField {
  id: string;
  name?: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  currentValue: string | boolean;
  options?: FormOption[];
  selector: string;
}

export interface FormSubmitButton {
  text: string;
  type: string;
  selector: string;
}

export interface DiscoveredForm {
  id: string;
  name?: string;
  action?: string;
  method?: string;
  fields: FormField[];
  submitButtons: FormSubmitButton[];
}

export interface FormInspectionResult {
  url: string;
  formsCount: number;
  totalFieldsCount: number;
  forms: DiscoveredForm[];
  evidence: {
    scannedAt: string;
    formsFound: number;
    requiredFieldsCount: number;
  };
}

export interface FormFillFieldResult {
  fieldId: string;
  label: string;
  type: string;
  requestedValue: string | boolean | number;
  appliedValue: string | boolean;
  success: boolean;
  error?: string;
}

export interface FormFillResult {
  formId: string;
  filledFields: FormFillFieldResult[];
  unfilledRequiredFields: string[];
  canSubmit: boolean;
  submitButtonText?: string;
  status: 'DRAFT_FILLED' | 'WAITING_FOR_USER_AUTHORIZATION' | 'FAILED';
  evidence: {
    fieldsTargeted: number;
    fieldsSucceeded: number;
    requiredComplete: boolean;
  };
}

export interface FormSubmitResult {
  formId: string;
  submitted: boolean;
  authorized: boolean;
  previousUrl: string;
  resultingUrl: string;
  navigationOccurred: boolean;
  statusText?: string;
  evidence: Record<string, unknown>;
}
