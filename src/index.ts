/**
 * JARVIS — Voice-First AI Assistant
 * Core Entry Point
 */

export const JARVIS_VERSION = '0.1.0';

export function getSystemInfo(): { version: string; status: string } {
  return {
    version: JARVIS_VERSION,
    status: 'INITIALIZING',
  };
}

export * from './config/index.js';
export * from './ai/index.js';
export * from './tools/index.js';
export * from './agents/index.js';
export * from './browser/index.js';
export * from './search/index.js';
export * from './forms/index.js';
export * from './files/index.js';

console.log(`[JARVIS] Core Agent Runtime v${JARVIS_VERSION} initialized.`);
