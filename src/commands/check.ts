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

const REQUIRED_SPINE = [
  'AGENTS.md',
  'docs/ARCHITECTURE.md',
  'docs/STACK.md',
  'docs/DATA.md',
  'docs/API.md',
  'docs/MAP.md',
  'docs/INTEGRATIONS.md',
  'docs/OPS.md',
  'docs/CONVENTIONS.md',
  'docs/GLOSSARY.md',
  'docs/SECURITY-NOTES.md',
  'docs/DECISIONS.md',
  'docs/HISTORY.md',
];

export async function checkCommand(opts: CheckOptions): Promise<number> {
  const repoPath = resolve(opts.path ?? process.cwd());
  const indexPath = join(repoPath, '.agents', 'index.json');

  if (!existsSync(indexPath)) {
    if (opts.json) {
      console.log(JSON.stringify({
        ok: false,
        errors: [{ severity: 'error', path: '.agents/index.json', message: 'not found — is this a docentic-scaffolded repo? run `docentic init` first' }],
        warnings: [],
        summary: { files_checked: 0, spine_files_present: 0, spine_files_missing: REQUIRED_SPINE },
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
        summary: { files_checked: 1, spine_files_present: 0, spine_files_missing: REQUIRED_SPINE },
      }, null, 2));
    } else {
      log.error(`.agents/index.json is not valid JSON`);
      log.dim(`  ${(err as Error).message}`);
    }
    return 1;
  }

  const indexIssues = validateAgentsIndex(raw);

  // 2. Check spine files exist
  const spineMissing: string[] = [];
  const spinePresent: string[] = [];
  for (const f of REQUIRED_SPINE) {
    if (existsSync(join(repoPath, f))) {
      spinePresent.push(f);
    } else {
      spineMissing.push(f);
    }
  }

  // Synthesize "spine file missing" as errors
  const spineIssues: ValidationIssue[] = spineMissing.map((f) => ({
    severity: 'error' as const,
    path: f,
    message: `spine file missing — every docentic-scaffolded repo must have this`,
  }));

  // 3. Check that every file listed in docs[] actually exists
  const fileExistsIssues: ValidationIssue[] = [];
  if (Array.isArray((raw as Record<string, unknown>).docs)) {
    const docs = (raw as { docs: Array<{ path?: unknown }> }).docs;
    for (const d of docs) {
      if (typeof d?.path === 'string' && !existsSync(join(repoPath, d.path))) {
        fileExistsIssues.push({
          severity: 'error',
          path: `docs[].${d.path}`,
          message: `listed in index.json but not found on disk`,
        });
      }
    }
  }

  // 4. Aggregate
  const allIssues = [...indexIssues, ...spineIssues, ...fileExistsIssues];
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

    if (report.summary.spine_files_present === REQUIRED_SPINE.length) {
      log.success(`All ${REQUIRED_SPINE.length} spine files present`);
    } else {
      log.warn(`${report.summary.spine_files_present}/${REQUIRED_SPINE.length} spine files present`);
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
