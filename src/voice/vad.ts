import { EventEmitter } from 'node:events';

export type VadState = 'SILENCE' | 'SPEECH_START' | 'SPEECH_ONGOING' | 'SPEECH_END';

export interface VadOptions {
  sampleRate?: number; // e.g. 16000
  frameSize?: number; // samples per frame, e.g. 512 (32ms at 16kHz)
  energyThreshold?: number; // RMS threshold between 0.0 and 1.0 (e.g. 0.015)
  minSpeechFrames?: number; // consecutive frames to confirm speech start
  silenceHangoverFrames?: number; // consecutive silence frames to trigger speech end
}

export interface VadFrameResult {
  state: VadState;
  rms: number;
  isVoice: boolean;
  frameIndex: number;
}

export interface SpeechCompletedEvent {
  audioBuffer: Buffer;
  durationMs: number;
  totalFrames: number;
}

/**
 * Real-time Voice Activity Detector (VAD) for streaming PCM audio buffers.
 */
export class VoiceActivityDetector extends EventEmitter {
  readonly sampleRate: number;
  readonly frameSize: number;
  readonly energyThreshold: number;
  readonly minSpeechFrames: number;
  readonly silenceHangoverFrames: number;

  private state: VadState = 'SILENCE';
  private frameCount = 0;
  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;
  private accumulatedFrames: Buffer[] = [];

  constructor(options?: VadOptions) {
    super();
    this.sampleRate = options?.sampleRate ?? 16000;
    this.frameSize = options?.frameSize ?? 512;
    this.energyThreshold = options?.energyThreshold ?? 0.02;
    this.minSpeechFrames = options?.minSpeechFrames ?? 3;
    this.silenceHangoverFrames = options?.silenceHangoverFrames ?? 15; // ~480ms silence to end speech
  }

  getState(): VadState {
    return this.state;
  }

  /**
   * Computes Root Mean Square (RMS) energy of a 16-bit PCM buffer.
   */
  computeRms(buffer: Buffer): number {
    const samples = buffer.length / 2;
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i) / 32768.0; // Normalized to [-1.0, 1.0]
      sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / samples);
  }

  /**
   * Processes a single raw PCM frame (typically 512 or 1024 bytes).
   */
  processFrame(frameBuffer: Buffer): VadFrameResult {
    this.frameCount++;
    const rms = this.computeRms(frameBuffer);
    const isVoice = rms >= this.energyThreshold;

    if (isVoice) {
      this.consecutiveSpeechFrames++;
      this.consecutiveSilenceFrames = 0;

      if (this.state === 'SILENCE' && this.consecutiveSpeechFrames >= this.minSpeechFrames) {
        this.state = 'SPEECH_START';
        this.emit('speech_start', { frameIndex: this.frameCount, rms });
        this.accumulatedFrames = [frameBuffer];
      } else if (this.state === 'SPEECH_START' || this.state === 'SPEECH_ONGOING') {
        this.state = 'SPEECH_ONGOING';
        this.accumulatedFrames.push(frameBuffer);
        this.emit('speech_frame', { frameIndex: this.frameCount, rms });
      }
    } else {
      this.consecutiveSilenceFrames++;
      this.consecutiveSpeechFrames = 0;

      if (this.state === 'SPEECH_ONGOING' || this.state === 'SPEECH_START') {
        this.accumulatedFrames.push(frameBuffer); // Include trailing silence for natural boundary

        if (this.consecutiveSilenceFrames >= this.silenceHangoverFrames) {
          this.state = 'SPEECH_END';
          const fullAudio = Buffer.concat(this.accumulatedFrames);
          const durationMs = (fullAudio.length / 2 / this.sampleRate) * 1000;

          const event: SpeechCompletedEvent = {
            audioBuffer: fullAudio,
            durationMs: Math.round(durationMs),
            totalFrames: this.accumulatedFrames.length,
          };

          this.emit('speech_end', event);
          this.reset();
        }
      } else {
        this.state = 'SILENCE';
      }
    }

    return {
      state: this.state,
      rms,
      isVoice,
      frameIndex: this.frameCount,
    };
  }

  /**
   * Processes an incoming streaming chunk of PCM data of arbitrary size,
   * segmenting it into standard frame sizes.
   */
  processChunk(pcmData: Buffer): VadFrameResult[] {
    const bytesPerFrame = this.frameSize * 2; // 16-bit = 2 bytes per sample
    const results: VadFrameResult[] = [];

    let offset = 0;
    while (offset + bytesPerFrame <= pcmData.length) {
      const frame = pcmData.subarray(offset, offset + bytesPerFrame);
      results.push(this.processFrame(frame));
      offset += bytesPerFrame;
    }

    return results;
  }

  /**
   * Resets the internal state and frame accumulators.
   */
  reset(): void {
    this.state = 'SILENCE';
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.accumulatedFrames = [];
  }
}
