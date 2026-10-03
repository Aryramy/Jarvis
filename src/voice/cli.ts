import path from 'node:path';
import { TTSProviderManager } from './tts-manager.js';
import {
  loadVoiceConfig,
  saveVoiceConfig,
  resetVoiceConfig,
  type VoiceMappingConfig,
} from './voice-config.js';
import { runVoiceAudition, getAuditionCandidates } from './audition.js';
import type { VoiceLanguage } from './types.js';

export interface CliRunOptions {
  list?: boolean;
  audition?: boolean;
  setEn?: string;
  setUr?: string;
  setAr?: string;
  setMixed?: string;
  reset?: boolean;
  json?: boolean;
  customOutputDir?: string;
  manager?: TTSProviderManager;
}

export function parseCliArgs(args: string[]): CliRunOptions {
  const options: CliRunOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--list' || arg === '-l') {
      options.list = true;
    } else if (arg === '--audition' || arg === '-a') {
      options.audition = true;
    } else if (arg === '--reset') {
      options.reset = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--set-en' && args[i + 1]) {
      options.setEn = args[++i];
    } else if (arg === '--set-ur' && args[i + 1]) {
      options.setUr = args[++i];
    } else if (arg === '--set-ar' && args[i + 1]) {
      options.setAr = args[++i];
    } else if (arg === '--set-mixed' && args[i + 1]) {
      options.setMixed = args[++i];
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.customOutputDir = args[++i];
    }
  }

  return options;
}

export async function runVoiceCli(options: CliRunOptions = {}): Promise<void> {
  const manager = options.manager || new TTSProviderManager();
  let currentConfig = await loadVoiceConfig();

  // 1. Handle Reset
  if (options.reset) {
    currentConfig = await resetVoiceConfig();
    if (options.json) {
      console.log(JSON.stringify({ status: 'RESET', config: currentConfig }));
    } else {
      console.log('\n[Voice CLI] Voice configuration has been reset to defaults.');
      console.log(`  EN:    ${currentConfig.en}`);
      console.log(`  UR:    ${currentConfig.ur}`);
      console.log(`  AR:    ${currentConfig.ar}`);
      console.log(`  MIXED: ${currentConfig.mixed}\n`);
    }
    return;
  }

  // 2. Handle Setting Specific Preferred Voices
  const updates: Partial<VoiceMappingConfig> = {};
  if (options.setEn) updates.en = options.setEn;
  if (options.setUr) updates.ur = options.setUr;
  if (options.setAr) updates.ar = options.setAr;
  if (options.setMixed) updates.mixed = options.setMixed;

  if (Object.keys(updates).length > 0) {
    currentConfig = await saveVoiceConfig(updates);
    if (options.json) {
      console.log(JSON.stringify({ status: 'UPDATED', config: currentConfig }));
    } else {
      console.log('\n[Voice CLI] Successfully updated voice mapping:');
      if (updates.en) console.log(`  English: ${updates.en}`);
      if (updates.ur) console.log(`  Urdu:    ${updates.ur}`);
      if (updates.ar) console.log(`  Arabic:  ${updates.ar}`);
      if (updates.mixed) console.log(`  Mixed:   ${updates.mixed}`);
      console.log('');
    }
    return;
  }

  // 3. Handle Audition Mode
  if (options.audition) {
    if (!options.json) {
      console.log('\n=======================================================');
      console.log('            JARVIS VOICE AUDITION ENGINE               ');
      console.log('=======================================================');
      console.log('Generating standardized listening samples for candidates...\n');
    }

    const report = await runVoiceAudition({
      manager,
      outputDirectory: options.customOutputDir,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(`Audition complete! Samples saved to: ${report.outputDirectory}\n`);

    const langs: VoiceLanguage[] = ['en', 'ur', 'ar'];
    for (const lang of langs) {
      const label = lang === 'en' ? 'ENGLISH' : lang === 'ur' ? 'URDU' : 'ARABIC';
      const activeVoice = currentConfig[lang];
      console.log(`--- ${label} SAMPLES ---`);
      const samples = report.samplesByLanguage[lang] || [];
      for (const s of samples) {
        const mark = s.voiceId === activeVoice ? '[ACTIVE *]' : '          ';
        const status = s.success ? `OK (${s.latencyMs}ms, ${s.byteLength}B)` : `FAIL: ${s.error}`;
        console.log(`  ${mark} ${s.voiceName.padEnd(26)} | Warmth: ${s.warmthScore}/10 | ${status}`);
        if (s.success) {
          console.log(`             Audio: ${path.basename(s.filePath)}`);
        }
      }
      console.log('');
    }

    console.log('RECOMMENDED HIGH-WARMTH VOICES:');
    console.log(`  English: ${report.recommendedVoices.en}`);
    console.log(`  Urdu:    ${report.recommendedVoices.ur}`);
    console.log(`  Arabic:  ${report.recommendedVoices.ar}\n`);
    return;
  }

  // 4. Handle List / Default Overview
  const candidates = await getAuditionCandidates(manager);

  if (options.json) {
    console.log(JSON.stringify({ config: currentConfig, candidates }, null, 2));
    return;
  }

  console.log('\n=======================================================');
  console.log('           JARVIS TRILINGUAL VOICE MAPPING             ');
  console.log('=======================================================');
  console.log('Active Preferred Voices:');
  console.log(`  English (en):    ${currentConfig.en}`);
  console.log(`  Urdu    (ur):    ${currentConfig.ur}`);
  console.log(`  Arabic  (ar):    ${currentConfig.ar}`);
  console.log(`  Mixed   (mixed): ${currentConfig.mixed}`);
  console.log('=======================================================\n');

  const langs: VoiceLanguage[] = ['en', 'ur', 'ar'];
  for (const lang of langs) {
    const label = lang === 'en' ? 'ENGLISH VOICES' : lang === 'ur' ? 'URDU VOICES' : 'ARABIC VOICES';
    const activeVoice = currentConfig[lang];
    console.log(`[${label}]`);
    const voices = candidates[lang] || [];
    for (const v of voices) {
      const activeMarker = v.id === activeVoice ? '[*]' : '   ';
      const naturalness = v.isNatural ? 'Natural' : 'Standard';
      console.log(`  ${activeMarker} ${v.id.padEnd(30)} | ${v.name.padEnd(24)} | ${v.provider.padEnd(14)} | Warmth: ${v.warmthScore ?? 7}/10 (${naturalness})`);
    }
    console.log('');
  }

  console.log('Commands:');
  console.log('  npm run voices -- --audition            Generate and save listening samples to disk');
  console.log('  npm run voices -- --set-en <voiceId>    Set preferred English voice');
  console.log('  npm run voices -- --set-ur <voiceId>    Set preferred Urdu voice');
  console.log('  npm run voices -- --set-ar <voiceId>    Set preferred Arabic voice');
  console.log('  npm run voices -- --reset               Reset configuration back to defaults\n');
}

// Auto-run if executed directly via CLI (tsx or node)
const scriptPath = process.argv[1]?.replace(/\\/g, '/') || '';
if (
  import.meta.url.endsWith(scriptPath) ||
  scriptPath.endsWith('cli.ts') ||
  scriptPath.endsWith('cli.js')
) {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);
  runVoiceCli(options).catch((err) => {
    console.error('\n[Voice CLI Error]', err.message);
    process.exit(1);
  });
}
