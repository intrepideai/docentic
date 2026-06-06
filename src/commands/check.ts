// `docentic check` — validate a scaffolded repo without modifying anything.
//
// Use cases:
//   1. CI step: catch drift / corruption / missing files on every PR
//   2. Local sanity check after manual edits
//   3. Pre-commit hook
//
// Exit codes:
//   0 — clean (no errors; warnings printed but don't fail)
//   1 — errors found
//   2 — could not run (not a docentic repo, etc.)

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateAgentsIndex, type ValidationIssue } from '../lib/validate-index.js';
import { log } from '../lib/log.js';

export interface CheckOptions {
  path?: string;
  json?: boolean;        // Output as JSON for tooling
  warningsAsErrors?: boolean; // CI strict mode
}

interface CheckReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: {
    files_checked: number;
    spine_files_present: number;
    spine_files_missing: string[];
  };
}

// The only files EVERY docentic repo must have, regardless of scaffold mode
// (--minimal / --spine-only). The rest of the required set is derived from the
// repo's own .agents/index.json docs[] — that's the source of truth for what
// was scaffolded, so a --minimal repo isn't failed for "missing" files it was
// never meant to have.
const HARD_CORE = ['AGENTS.md', 'docs/ARCHITECTURE.md'];

// Compute the set of files that must exist on disk: the hard core plus every
// path the index lists in docs[]. Deduplicated, order-stable.
function requiredFiles(raw: unknown): string[] {
  const fromIndex: string[] = [];
  const docs = (raw as { docs?: unknown }).docs;
  if (Array.isArray(docs)) {
    for (const d of docs) {
      const p = (d as { path?: unknown }).path;
      if (typeof p === 'string' && p.length > 0) fromIndex.push(p);
    }
  }
  return Array.from(new Set([...HARD_CORE, ...fromIndex]));
}

export async function checkCommand(opts: CheckOptions): Promise<number> {
  const repoPath = resolve(opts.path ?? process.cwd());
  const indexPath = join(repoPath, '.agents', 'index.json');

  if (!existsSync(indexPath)) {
    if (opts.json) {
      console.log(JSON.stringify({
        ok: false,
        errors: [{ severity: 'error', path: '.agents/index.json', message: 'not found — is this a docentic-scaffolded repo? run `docentic init` first' }],
        warnings: [],
        summary: { files_checked: 0, spine_files_present: 0, spine_files_missing: HARD_CORE },
      }, null, 2));
    } else {
      log.error(`Not a docentic-scaffolded repo: ${repoPath}`);
      log.dim(`  expected .agents/index.json — run \`docentic init\` to scaffold`);
    }
    return 2;
  }

  // 1. Parse and validate the index
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(indexPath, 'utf-8'));
  } catch (err) {
    if (opts.json) {
      console.log(JSON.stringify({
        ok: false,
        errors: [{ severity: 'error', path: '.agents/index.json', message: `invalid JSON: ${(err as Error).message}` }],
        warnings: [],
        summary: { files_checked: 1, spine_files_present: 0, spine_files_missing: HARD_CORE },
      }, null, 2));
    } else {
      log.error(`.agents/index.json is not valid JSON`);
      log.dim(`  ${(err as Error).message}`);
    }
    return 1;
  }

  const indexIssues = validateAgentsIndex(raw);

  // 2. Check that every required file exists. The required set = the hard core
  // + everything the index's docs[] lists. Each file is checked ONCE, so a
  // missing file is reported a single time with a clean path (no more
  // double-reporting or malformed `docs[].<path>` keys).
  const required = requiredFiles(raw);
  const spineMissing: string[] = [];
  const spinePresent: string[] = [];
  const fileIssues: ValidationIssue[] = [];
  for (const f of required) {
    if (existsSync(join(repoPath, f))) {
      spinePresent.push(f);
    } else {
      spineMissing.push(f);
      fileIssues.push({
        severity: 'error',
        path: f,
        message: HARD_CORE.includes(f)
          ? `required core file missing — every docentic-scaffolded repo must have this`
          : `listed in .agents/index.json but not found on disk`,
      });
    }
  }

  // 3. Aggregate
  const allIssues = [...indexIssues, ...fileIssues];
  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');

  const report: CheckReport = {
    ok: errors.length === 0 && (!opts.warningsAsErrors || warnings.length === 0),
    errors,
    warnings,
    summary: {
      files_checked: spinePresent.length + spineMissing.length,
      spine_files_present: spinePresent.length,
      spine_files_missing: spineMissing,
    },
  };

  // 5. Output
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    log.step(`docentic check`);
    log.dim(`  repo: ${repoPath}`);
    log.blank();

    if (spineMissing.length === 0) {
      log.success(`All ${required.length} required files present`);
    } else {
      log.warn(`${report.summary.spine_files_present}/${required.length} required files present`);
    }

    if (errors.length === 0 && warnings.length === 0) {
      log.success(`No issues — repo is healthy`);
    } else {
      if (errors.length > 0) {
        log.blank();
        log.error(`${errors.length} error(s):`);
        for (const e of errors) {
          console.log(`    ${e.path}: ${e.message}`);
        }
      }
      if (warnings.length > 0) {
        log.blank();
        log.warn(`${warnings.length} warning(s):`);
        for (const w of warnings) {
          console.log(`    ${w.path}: ${w.message}`);
        }
      }
    }
  }

  return report.ok ? 0 : 1;
}
