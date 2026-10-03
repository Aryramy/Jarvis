/**
 * Credential Protection & Sensitive Data Sanitizer
 * 
 * Enforces NFR-004: Zero persistence of authentication secrets, passwords,
 * OTPs, session cookies, payment card numbers, or API keys in memory files.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /^pwd$/i,
  /secret/i,
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /session[_-]?token/i,
  /session[_-]?cookie/i,
  /bearer/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
  /^otp$/i,
  /^pin$/i,
  /cvv/i,
  /cvc/i,
  /credit[_-]?card/i,
  /card[_-]?number/i,
  /card[_-]?cvv/i,
  /security[_-]?code/i,
];

// String regex patterns to redact within string text
const SENSITIVE_STRING_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Bearer tokens
  { regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // JWT tokens (3-part base64)
  { regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: '[REDACTED_JWT]' },
  // PEM Private keys
  { regex: /-----BEGIN(?:[A-Z0-9 ]+)?PRIVATE KEY-----[\s\S]*?-----END(?:[A-Z0-9 ]+)?PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },
  // Credit Card Numbers (13 to 19 digits formatted or unformatted)
  { regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g, replacement: '[REDACTED_CARD_NUMBER]' },
  // Generic 16-digit card pattern with dashes/spaces
  { regex: /\b(?:\d{4}[ -]){3}\d{4}\b/g, replacement: '[REDACTED_CARD_NUMBER]' },
  // Basic Auth URLs: https://user:password@domain.com
  { regex: /:\/\/([^:\s]+):([^@\s]+)@/g, replacement: '://$1:[REDACTED_PASSWORD]@' },
];

/**
 * Checks whether an object property key indicates sensitive credentials.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Scrubs known sensitive string patterns (Bearer tokens, JWTs, card numbers, private keys).
 */
export function sanitizeString(value: string): string {
  if (!value || typeof value !== 'string') return value;

  let sanitized = value;
  for (const { regex, replacement } of SENSITIVE_STRING_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}

/**
 * Recursively deep-sanitizes any data structure, replacing values associated with
 * sensitive keys or containing sensitive patterns with safe redactions.
 */
export function sanitizeData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeString(data) as unknown as T;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        sanitizedObj[key] = '[REDACTED_CREDENTIAL]';
      } else {
        sanitizedObj[key] = sanitizeData(val);
      }
    }
    return sanitizedObj as T;
  }

  return data;
}

/**
 * Tests whether a value or structure contains detectable sensitive credentials.
 */
export function containsCredentials(data: unknown): boolean {
  if (data === null || data === undefined) return false;

  if (typeof data === 'string') {
    return SENSITIVE_STRING_PATTERNS.some(({ regex }) => {
      const match = new RegExp(regex.source, regex.flags).test(data);
      return match;
    });
  }

  if (Array.isArray(data)) {
    return data.some((item) => containsCredentials(item));
  }

  if (typeof data === 'object') {
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKey(key)) return true;
      if (containsCredentials(val)) return true;
    }
  }

  return false;
}
