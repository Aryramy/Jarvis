import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type {
  TTSProvider,
  TTSVoiceInfo,
  TTSOptions,
  TTSAudioResult,
} from '../tts-types.js';
import type { VoiceLanguage } from '../types.js';

const execFileAsync = promisify(execFile);

export class WindowsSapiTTSProvider implements TTSProvider {
  readonly id = 'windows-sapi';
  readonly name = 'Windows SAPI Neural/Desktop Voice';
  private cachedVoices: TTSVoiceInfo[] | null = null;
  private isWindows = process.platform === 'win32';

  async isAvailable(): Promise<boolean> {
    if (!this.isWindows) return false;
    try {
      const voices = await this.getVoices();
      return voices.length > 0;
    } catch {
      return false;
    }
  }

  async getVoices(): Promise<TTSVoiceInfo[]> {
    if (this.cachedVoices) return this.cachedVoices;
    if (!this.isWindows) return [];

    try {
      const psScript = `
        Add-Type -AssemblyName System.Speech
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $synth.GetInstalledVoices() | ForEach-Object {
          $v = $_.VoiceInfo
          [PSCustomObject]@{
            Name = $v.Name
            Culture = $v.Culture.Name
            Gender = $v.Gender.ToString()
            Description = $v.Description
          }
        } | ConvertTo-Json -Compress
      `;

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psScript,
      ]);

      const trimmed = stdout.trim();
      if (!trimmed) {
        this.cachedVoices = [];
        return [];
      }

      const parsed = JSON.parse(trimmed);
      const rawList = Array.isArray(parsed) ? parsed : [parsed];

      this.cachedVoices = rawList.map((v: any) => {
        const culture = (v.Culture || '').toLowerCase();
        let lang: VoiceLanguage = 'en';
        if (culture.startsWith('ur')) lang = 'ur';
        else if (culture.startsWith('ar')) lang = 'ar';

        return {
          id: v.Name,
          name: v.Name,
          language: lang,
          locale: v.Culture || 'en-US',
          gender: (v.Gender || 'neutral').toLowerCase() as 'male' | 'female' | 'neutral',
          provider: this.id,
          isNatural: false,
          warmthScore: 6.5,
          description: v.Description || `${v.Name} Desktop Voice`,
        };
      });

      return this.cachedVoices;
    } catch (err: any) {
      console.warn(`[WindowsSapiTTSProvider] Failed to enumerate voices: ${err.message}`);
      return [];
    }
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSAudioResult> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `jarvis_tts_${crypto.randomUUID()}.wav`);
    try {
      const result = await this.synthesizeToFile(text, tempFile, options);
      const audioBuffer = await fs.promises.readFile(tempFile);
      return {
        ...result,
        audioBuffer,
        filePath: undefined,
      };
    } finally {
      if (fs.existsSync(tempFile)) {
        await fs.promises.unlink(tempFile).catch(() => {});
      }
    }
  }

  async synthesizeToFile(
    text: string,
    outputFilePath: string,
    options?: TTSOptions
  ): Promise<TTSAudioResult> {
    if (!this.isWindows) {
      throw new Error('[WindowsSapiTTSProvider] Windows SAPI is only available on win32 platforms.');
    }

    const start = performance.now();
    const resolvedPath = path.resolve(outputFilePath);
    await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });

    const voices = await this.getVoices();
    let selectedVoice = options?.voice;

    if (!selectedVoice) {
      const lang = options?.language || 'en';
      const matching = voices.find((v) => v.language === lang);
      selectedVoice = matching ? matching.name : voices[0]?.name || 'Microsoft David Desktop';
    }

    // Escape text for PowerShell single-quote literal
    const escapedText = text.replace(/'/g, "''");
    const escapedVoice = selectedVoice.replace(/'/g, "''");
    const escapedPath = resolvedPath.replace(/'/g, "''");

    const psScript = `
      Add-Type -AssemblyName System.Speech
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
      try {
        $synth.SelectVoice('${escapedVoice}')
      } catch {}
      $synth.SetOutputToWaveFile('${escapedPath}')
      $synth.Speak('${escapedText}')
      $synth.Dispose()
    `;

    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript,
    ]);

    const latencyMs = Math.round(performance.now() - start);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`[WindowsSapiTTSProvider] Output WAV file was not created: ${resolvedPath}`);
    }

    const stats = await fs.promises.stat(resolvedPath);
    if (stats.size === 0) {
      throw new Error(`[WindowsSapiTTSProvider] Output WAV file was 0 bytes.`);
    }

    const audioBuffer = await fs.promises.readFile(resolvedPath);

    return {
      audioBuffer,
      format: 'wav',
      provider: this.id,
      voice: selectedVoice,
      language: options?.language || 'en',
      latencyMs,
      durationMs: Math.round(text.length * 65), // approx speaking duration
      sampleRate: 16000,
      filePath: resolvedPath,
      byteLength: stats.size,
    };
  }
}
