import ffmpeg from 'fluent-ffmpeg';
import { existsSync, writeFileSync } from 'fs';
import * as path from 'path';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const staticPath: string | null = require('ffmpeg-static') as string | null;
  if (staticPath && existsSync(staticPath)) {
    ffmpeg.setFfmpegPath(staticPath);
  }
} catch {
  // fall back to system ffmpeg in PATH
}

export async function assembleVideo(
  framesDir: string,
  audioPath: string | null,
  outputPath: string,
  fps: number,
  crf = 18
): Promise<void> {
  // FFmpeg expects forward slashes in the input pattern. Frames are named by GLOBAL index
  // (frame_000000.png …) — when rendered in parallel, every worker writes into THIS shared
  // dir using its global frame number, so a single sequential read assembles them in order
  // with no gaps or duplicates at chunk boundaries.
  const inputPattern = framesDir.replace(/\\/g, '/') + '/frame_%06d.png';

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(inputPattern)
      .inputOptions(['-framerate', String(fps), '-start_number', '0'])
      .videoCodec('libx264')
      .outputOptions(['-pix_fmt', 'yuv420p', '-crf', String(crf)]);

    if (audioPath && existsSync(audioPath)) {
      cmd = cmd.input(audioPath).audioCodec('aac').outputOptions(['-shortest']);
    }

    // Ensure output directory path uses correct separators
    const normalizedOutput = path.resolve(outputPath);

    cmd
      .output(normalizedOutput)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Concatenate worker-encoded chunk .mp4s (stream copy — no re-encode, no quality loss) and mux
 * the audio in the same pass (session 7). Chunks were all encoded by the same libx264 settings
 * at the same fps, so the concat demuxer joins them seamlessly; each chunk starts on an IDR
 * frame and x264's default closed GOPs mean no cross-chunk references.
 */
export async function concatChunks(
  chunkPaths: string[],
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  const listPath = path.join(path.dirname(chunkPaths[0]), 'concat.txt');
  // concat-demuxer list: forward slashes work on Windows; single quotes around each path.
  const list = chunkPaths
    .map((p) => `file '${path.resolve(p).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');
  writeFileSync(listPath, list, 'utf8');

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0']);

    if (audioPath && existsSync(audioPath)) {
      cmd = cmd.input(audioPath).audioCodec('aac').outputOptions(['-shortest']);
    }

    cmd
      .outputOptions(['-c:v', 'copy'])
      .output(path.resolve(outputPath))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}
