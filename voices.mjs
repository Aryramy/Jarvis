#!/usr/bin/env node

/**
 * JARVIS — Voice Audition & Configuration CLI
 *
 * Usage:
 *   node voices.mjs                 # List available voices & current active mapping
 *   node voices.mjs --audition      # Generate standardized listening samples on disk
 *   node voices.mjs --set-en <id>   # Set preferred English voice
 *   node voices.mjs --set-ur <id>   # Set preferred Urdu voice
 *   node voices.mjs --set-ar <id>   # Set preferred Arabic voice
 *   node voices.mjs --reset         # Reset configuration back to defaults
 *   node voices.mjs --json          # Output results as JSON
 */

import { parseCliArgs, runVoiceCli } from './dist/voice/cli.js';

const args = process.argv.slice(2);
const options = parseCliArgs(args);

runVoiceCli(options).catch((err) => {
  console.error('\n[Voice CLI Error]', err.message);
  process.exit(1);
});
