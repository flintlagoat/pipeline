import * as path from 'path';

// Project root, resolved from this file's location (…/pipeline/src/config → up 3). Shared by the
// publish/ and analytics/ modules so every file agrees on where channels/, jobs/, output/ live.
export const ROOT = path.resolve(__dirname, '..', '..', '..');

export const channelDir = (id: string) => path.join(ROOT, 'channels', id);
export const jobDir = (c: string, j: string) => path.join(ROOT, 'jobs', c, j);
export const outputDir = (c: string, j: string) => path.join(ROOT, 'output', c, j);
