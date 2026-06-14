import { execFileSync } from 'child_process';
import { writeFileSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

// Windows SAPI stand-in backend (System.Speech). A zero-cost local fallback when no hosted TTS
// key is configured. Windows-only. Writes a wav directly via PowerShell.
export function sapiAvailable(): boolean {
  return os.platform() === 'win32';
}

/** Synthesize `text` to `outWavPath` using Windows System.Speech. Throws on non-Windows. */
export function sapiSynthesize(text: string, outWavPath: string): void {
  if (!sapiAvailable()) throw new Error('SAPI stand-in TTS is only available on Windows');

  // Pass the text via a temp file to avoid any quoting/length issues in the PS command.
  const tmpTxt = path.join(os.tmpdir(), `tts_${Date.now()}.txt`);
  writeFileSync(tmpTxt, text, 'utf8');
  const ps = [
    `$ErrorActionPreference='Stop'`,
    `Add-Type -AssemblyName System.Speech`,
    `$t=[System.IO.File]::ReadAllText('${tmpTxt.replace(/'/g, "''")}')`,
    `$s=New-Object System.Speech.Synthesis.SpeechSynthesizer`,
    `$s.Rate=0`,
    `$s.SetOutputToWaveFile('${outWavPath.replace(/'/g, "''")}')`,
    `$s.Speak($t)`,
    `$s.Dispose()`,
  ].join('; ');
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
  } finally {
    rmSync(tmpTxt, { force: true });
  }
}
