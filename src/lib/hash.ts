// Content hashing for drift detection.
//
// Generated docs carry volatile frontmatter (`updated:` is stamped with the
// generation timestamp on every run; `hash:`/`generated_hash:` are bookkeeping).
// Hashing the raw file would therefore report drift on every regeneration even
// when the substantive content is identical. We strip those lines first so the
// hash reflects *content*, not when it was last written.
//
// MUST stay byte-compatible with the `sha()` helper in
// templates/scripts/llm-docs/validate.sh and the hash step in
// templates/scripts/llm-docs/MAINTAIN.md — they normalize the same way so a
// hash recorded by the maintenance loop verifies here in `docentic check`.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const VOLATILE_LINE = /^(updated|hash|generated_hash): /;

// Invariant for byte-equality with the shell `sed | sha256sum` path: the
// volatile lines live in the top frontmatter block and a file always ends in a
// newline. (If a volatile line were ever the final line with NO trailing
// newline, sed would keep the preceding newline and this split/join would not —
// desyncing the two hashes. Generators emit via `cat <<EOF`, so that can't
// happen, but keep it true if you add a generator.)
export function normalizeForHash(content: string): string {
  return content
    .split('\n')
    .filter((line) => !VOLATILE_LINE.test(line))
    .join('\n');
}

// sha256 of the normalized content, or null if the file can't be read.
export function fileContentHash(path: string): string | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    return createHash('sha256').update(normalizeForHash(raw), 'utf-8').digest('hex');
  } catch {
    return null;
  }
}
