import WebSocket from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  TTSProvider,
  TTSVoiceInfo,
  TTSOptions,
  TTSAudioResult,
} from '../tts-types.js';
import type { VoiceLanguage } from '../types.js';

export class EdgeTTSProvider implements TTSProvider {
  readonly id = 'edge-tts';
  readonly name = 'Microsoft Edge Natural Neural TTS';

  static readonly TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  static readonly WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
  static readonly SEC_MS_GEC_VERSION = '1-143.0.3650.75';

  private defaultVoices: Record<VoiceLanguage, string> = {
    en: 'en-US-ChristopherNeural',
    ur: 'ur-PK-AsadNeural',
    ar: 'ar-SA-HamedNeural',
    mixed: 'en-US-ChristopherNeural',
  };

  async isAvailable(): Promise<boolean> {
    // Edge TTS is considered available if network connectivity allows WebSocket handshake
    return true;
  }

  async getVoices(): Promise<TTSVoiceInfo[]> {
    return [
      // English Neural Voices
      {
        id: 'en-US-ChristopherNeural',
        name: 'Christopher (Neural)',
        language: 'en',
        locale: 'en-US',
        gender: 'male',
        provider: this.id,
        isNatural: true,
        warmthScore: 9.2,
        description: 'Warm, authoritative, natural American English male voice',
      },
      {
        id: 'en-US-JennyNeural',
        name: 'Jenny (Neural)',
        language: 'en',
        locale: 'en-US',
        gender: 'female',
        provider: this.id,
        isNatural: true,
        warmthScore: 9.3,
        description: 'Conversational, warm American English female voice',
      },
      {
        id: 'en-GB-RyanNeural',
        name: 'Ryan (Neural)',
        language: 'en',
        locale: 'en-GB',
        gender: 'male',
        provider: this.id,
        isNatural: true,
        warmthScore: 9.0,
        description: 'Crisp British English male neural voice',
      },
      // Urdu Neural Voices
      {
        id: 'ur-PK-AsadNeural',
        name: 'Asad (Neural)',
        language: 'ur',
        locale: 'ur-PK',
        gender: 'male',
        provider: this.id,
        isNatural: true,
        warmthScore: 9.1,
        description: 'Clear, natural Pakistani Urdu male voice',
      },
      {
        id: 'ur-PK-UzmaNeural',
        name: 'Uzma (Neural)',
        language: 'ur',
        locale: 'ur-PK',
        gender: 'female',
        provider: this.id,
        isNatural: true,
        warmthScore: 9.0,
        description: 'Warm, expressive Pakistani Urdu female voice',
      },
      // Arabic Neural Voices
      {
        id: 'ar-SA-HamedNeural',
        name: 'Hamed (Neural)',
        language: 'ar',
        locale: 'ar-SA',
        gender: 'male',
        provider: this.id,
        isNatural: true,
        warmthScore: 9.0,
        description: 'Natural Saudi Arabic male voice with clear MSA pronunciation',
      },
      {
        id: 'ar-SA-ZariyahNeural',
        name: 'Zariyah (Neural)',
        language: 'ar',
        locale: 'ar-SA',
        gender: 'female',
        provider: this.id,
        isNatural: true,
        warmthScore: 9.1,
        description: 'Expressive Saudi Arabic female voice',
      },
    ];
  }

  /**
   * Generates Windows FileTime Epoch based anti-abuse token (Sec-MS-GEC).
   */
  private generateSecMsGec(): string {
    const ticks = Math.floor(Date.now() / 1000) + 11644473600;
    const rounded = ticks - (ticks % 300);
    const windowsTicks = rounded * 10000000;
    return crypto
      .createHash('sha256')
      .update(`${windowsTicks}${EdgeTTSProvider.TRUSTED_TOKEN}`)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Builds SSML request string for Microsoft Speech Synthesis.
   */
  private buildSSML(text: string, voice: string, rate = '+0%', pitch = '+0Hz', volume = '+0%'): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    return (
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
      `<voice name='${voice}'>` +
      `<prosody rate='${rate}' pitch='${pitch}' volume='${volume}'>` +
      `${escaped}` +
      `</prosody>` +
      `</voice>` +
      `</speak>`
    );
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSAudioResult> {
    const start = performance.now();
    const lang: VoiceLanguage = options?.language || 'en';
    const voice = options?.voice || this.defaultVoices[lang] || this.defaultVoices.en;
    const timeoutMs = options?.timeoutMs || 4000;

    const secMsGec = this.generateSecMsGec();
    const connectionId = crypto.randomUUID().replace(/-/g, '');
    const url =
      `${EdgeTTSProvider.WSS_URL}?TrustedClientToken=${EdgeTTSProvider.TRUSTED_TOKEN}` +
      `&Sec-MS-GEC=${secMsGec}` +
      `&Sec-MS-GEC-Version=${EdgeTTSProvider.SEC_MS_GEC_VERSION}` +
      `&ConnectionId=${connectionId}`;

    const chunks: Buffer[] = [];
    let firstByteLatencyMs: number | undefined;

    return new Promise<TTSAudioResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          ws.terminate();
        } catch {}
        reject(
          new Error(
            `[EdgeTTSProvider] Request timed out after ${timeoutMs}ms (first-byte latency SLA exceeded).`
          )
        );
      }, timeoutMs);

      let ws: WebSocket;
      try {
        ws = new WebSocket(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
            'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache',
          },
        });
      } catch (err: any) {
        clearTimeout(timeout);
        return reject(new Error(`[EdgeTTSProvider] WebSocket instantiation failed: ${err.message}`));
      }

      ws.on('open', () => {
        // 1. Send speech.config
        const configMsg =
          `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'false',
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          });
        ws.send(configMsg);

        // 2. Send SSML
        const requestId = crypto.randomUUID().replace(/-/g, '');
        const ssml = this.buildSSML(
          text,
          voice,
          typeof options?.rate === 'string' ? options.rate : '+0%',
          typeof options?.pitch === 'string' ? options.pitch : '+0Hz',
          typeof options?.volume === 'string' ? options.volume : '+0%'
        );

        const ssmlMsg =
          `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml;

        ws.send(ssmlMsg);
      });

      ws.on('message', (data: any) => {
        if (Buffer.isBuffer(data)) {
          if (data.length > 2) {
            const headerLen = data.readUInt16BE(0);
            if (data.length > headerLen + 2) {
              const audioChunk = data.subarray(headerLen + 2);
              if (audioChunk.length > 0) {
                if (firstByteLatencyMs === undefined) {
                  firstByteLatencyMs = Math.round(performance.now() - start);
                }
                chunks.push(audioChunk);
              }
            }
          }
        } else if (typeof data === 'string') {
          if (data.includes('Path:turn.end')) {
            clearTimeout(timeout);
            try {
              ws.close();
            } catch {}
            const totalBuffer = Buffer.concat(chunks);
            const latencyMs = Math.round(performance.now() - start);
            resolve({
              audioBuffer: totalBuffer,
              format: 'mp3',
              provider: this.id,
              voice,
              language: lang,
              latencyMs,
              sampleRate: 24000,
              byteLength: totalBuffer.length,
            });
          }
        }
      });

      ws.on('error', (err: any) => {
        clearTimeout(timeout);
        try {
          ws.terminate();
        } catch {}
        reject(new Error(`[EdgeTTSProvider] WebSocket error: ${err.message}`));
      });
    });
  }

  async synthesizeToFile(
    text: string,
    outputFilePath: string,
    options?: TTSOptions
  ): Promise<TTSAudioResult> {
    const result = await this.synthesize(text, options);
    const resolvedPath = path.resolve(outputFilePath);
    await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.promises.writeFile(resolvedPath, result.audioBuffer);

    return {
      ...result,
      filePath: resolvedPath,
    };
  }
}
