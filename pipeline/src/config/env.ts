import * as fs from 'fs';
import * as path from 'path';

// Tiny zero-dependency .env loader (dotenv-equivalent). Loads KEY=VALUE pairs from the project
// root .env into process.env at process startup, WITHOUT clobbering anything already set in the
// real environment (real env vars win — e.g. CI / `setx FISH_API_KEY`). Import this module for
// its side effect ONCE at every entry point (cli.ts, server.ts) before anything reads a key.
//
// Why not the `dotenv` package: avoids adding a dependency/network install; the format we need
// is trivial (no multiline, no interpolation). Behavior matches dotenv for the common case.

const ROOT = path.resolve(__dirname, '..', '..', '..'); // project root (…/pipeline/src/config → root)

function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let val = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

let loaded = false;

/** Load .env from the project root into process.env (idempotent; real env vars take precedence). */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const parsed = parseEnv(fs.readFileSync(envPath, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
    }
  } catch (e) {
    console.warn(`  [env] could not read .env: ${(e as Error).message}`);
  }
}

// Side-effect load on import.
loadEnv();
