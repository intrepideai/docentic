// Single source of truth for docentic's own version.
//
// Reads `version` from the package's own package.json at runtime so the CLI
// `--version`, the scaffolded `.agents/index.json` template_version, and any
// other caller can never drift from what was actually published. Do NOT
// hardcode a version string anywhere else.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compiled to dist/lib/version.js — package.json lives two levels up, beside
// dist/. In dev (src/lib/version.ts) the same relative path resolves to the
// repo root. Both are correct.
const __dirname = dirname(fileURLToPath(import.meta.url));

export function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
