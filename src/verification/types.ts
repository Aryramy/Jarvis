export type AssertionType =
  | 'URL_CHANGED'
  | 'URL_CONTAINS'
  | 'URL_EQUALS'
  | 'TITLE_CONTAINS'
  | 'ELEMENT_VISIBLE'
  | 'ELEMENT_HIDDEN'
  | 'TEXT_PRESENT'
  | 'TEXT_ABSENT'
  | 'VALUE_EQUALS'
  | 'FILE_EXISTS_ON_DISK'
  | 'STATE_MUTATED';

export interface VerificationAssertion {
  type: AssertionType;
  expected?: unknown;
  target?: string; // CSS selector, filename, or text
  description?: string;
}

export interface StateSnapshot {
  timestamp: number;
  browser?: {
    url: string;
    title: string;
    activeTabId?: string;
    tabCount: number;
    bodyTextSnippet: string;
  };
  element?: {
    target: string;
    exists: boolean;
    visible: boolean;
    value?: string | boolean;
    text?: string;
  };
  file?: {
    path: string;
    exists: boolean;
    sizeBytes: number;
  };
}

export interface VerificationCheck {
  assertionType: AssertionType;
  description: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  message: string;
}

export type VerificationStatus =
  | 'VERIFIED'
  | 'FAILED'
  | 'WAITING_FOR_USER'
  | 'INCONCLUSIVE';

export interface VerificationReport {
  verified: boolean;
  status: VerificationStatus;
  checks: VerificationCheck[];
  preSnapshot: StateSnapshot;
  postSnapshot: StateSnapshot;
  durationMs: number;
  humanNotice?: string;
  evidence: {
    passedChecksCount: number;
    totalChecksCount: number;
    allPassed: boolean;
    sensitiveHandoffDetected: boolean;
    timestamp: string;
  };
}

export interface SnapshotOptions {
  includeElement?: string; // target selector
  includeFile?: string; // target file path
}
