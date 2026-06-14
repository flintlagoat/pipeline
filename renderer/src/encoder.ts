import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { once } from 'events';

// Streaming frame encoder (session 7). Pipes raw RGBA frames straight into an ffmpeg libx264
// process over stdin — no PNG encode, no frames-on-disk, no decode pass at assemble time. Each
// render worker owns ONE encoder producing one chunk .mp4; the main thread concatenates the
// chunks (stream copy, no re-encode) and muxes audio. This replaces the PNG-per-frame pipeline
// that cost ~50-150ms of PNG encode per frame plus tens of GB of temp disk on long videos.

export function resolveFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const staticPath: string | null = require('ffmpeg-static') as string | null;
    if (staticPath && existsSync(staticPath)) return staticPath;
  } catch { /* fall back to PATH */ }
  return 'ffmpeg';
}

export interface EncoderOpts {
  width: number;
  height: number;
  fps: number;
  crf: number;
  outPath: string;
  preset?: string;  // x264 preset (default 'medium' — matches the old assemble pass)
  threads?: number; // x264 threads; 1 when many parallel workers each own an encoder, 0 = auto
}

export class FrameEncoder {
  private proc: ChildProcess;
  private stderrTail = '';
  private exited: Promise<number | null>;
  readonly frameBytes: number;

  constructor(opts: EncoderOpts) {
    this.frameBytes = opts.width * opts.height * 4;
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba',
      '-s', `${opts.width}x${opts.height}`,
      '-r', String(opts.fps),
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', opts.preset ?? 'medium',
      '-crf', String(opts.crf),
      '-pix_fmt', 'yuv420p',
      ...(opts.threads !== undefined ? ['-threads', String(opts.threads)] : []),
      opts.outPath,
    ];
    this.proc = spawn(resolveFfmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.proc.stderr?.on('data', (d: Buffer) => {
      this.stderrTail = (this.stderrTail + d.toString()).slice(-4000);
    });
    // EPIPE on stdin (encoder died) must not crash the process — it surfaces as a thrown
    // error from write()/close() via the exit code instead.
    this.proc.stdin?.on('error', () => { /* surfaced via exit code */ });
    this.exited = new Promise((res) => this.proc.on('close', (code) => res(code)));
  }

  /** Write one frame of raw RGBA. Respects pipe backpressure; throws if the encoder died. */
  async write(rgba: Buffer): Promise<void> {
    if (rgba.length !== this.frameBytes) {
      throw new Error(`encoder fed ${rgba.length} bytes, expected ${this.frameBytes} (one ${this.frameBytes / 4}px RGBA frame)`);
    }
    const stdin = this.proc.stdin;
    if (!stdin || !stdin.writable) {
      throw new Error(`ffmpeg encoder closed early: ${this.stderrTail || '(no stderr)'}`);
    }
    if (!stdin.write(rgba)) {
      const result = await Promise.race([
        once(stdin, 'drain').then(() => 'drain' as const),
        this.exited, // resolves with an exit code (number|null) — never throws
      ]);
      if (result !== 'drain') {
        throw new Error(`ffmpeg encoder exited mid-stream (code ${result}): ${this.stderrTail}`);
      }
    }
  }

  /** Finish the stream and wait for the encoder to exit cleanly. */
  async close(): Promise<void> {
    this.proc.stdin?.end();
    const code = await this.exited;
    if (code !== 0) {
      throw new Error(`ffmpeg encoder exited with code ${code}: ${this.stderrTail || '(no stderr)'}`);
    }
  }
}
