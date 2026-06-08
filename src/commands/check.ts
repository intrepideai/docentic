// `docentic check` — validate a scaffolded repo without modifying anything.
//
// What it checks:
//   1. .agents/index.json is present, valid JSON, and schema-conformant
//   2. Every file the index lists actually exists on disk (+ the hard core)
//   3. Spine docs don't link to files that don't exist (broken references)
//   4. Human/AI docs don't still carry unfilled scaffold TODO markers
//   5. Generated docs haven't drifted from their recorded content hash
//      (dormant until a maintenance pass records real hashes — `pending` skips)
//
// 3–5 are warnings by default, so a freshly-scaffolded repo (and everyday use)
// passes the default check. --warnings-as-errors escalates them to failures —
// the strict gate to add to CI once your docs are filled: it fails on leftover
// TODOs, broken references, or drift. A fresh scaffold, which still has unfilled
// TODOs by design, intentionally FAILS strict mode until you fill it.
//
// Exit codes:
//   0 — clean (no errors; warnings printed but don't fail unless --strict)
//   1 — errors found
//   2 — could not run (not a docentic repo, etc.)

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { validateAgentsIndex, type ValidationIssue } from '../lib/validate-index.js';
import { fileContentHash } from '../lib/hash.js';
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
      if (typeof d !== 'object' || d === null) continue; // tolerate a botched hand-edit (null/hole)
      const p = (d as { path?: unknown }).path;
      if (typeof p === 'string' && p.length > 0) fromIndex.push(p);
    }
  }
  return Array.from(new Set([...HARD_CORE, ...fromIndex]));
}

// The spine docs docentic ever scaffolds. Used to tell an intentionally
// mode-omitted spine doc (e.g. --minimal drops docs/STACK.md, and AGENTS.md's
// static "where to look" table still links to it) apart from a genuine typo or
// a renamed/removed file. Links to these are not flagged as broken.
const SPINE_DOC_NAMES = new Set([
  'ARCHITECTURE', 'STACK', 'DATA', 'API', 'MAP', 'INTEGRATIONS', 'OPS',
  'CONVENTIONS', 'GLOSSARY', 'SECURITY-NOTES', 'DECISIONS', 'HISTORY',
  'UI', 'INFRA', 'ML', 'MOBILE',
]);

function isOmittableSpineDoc(resolvedRelPath: string): boolean {
  const m = /^docs\/([A-Z-]+)\.md$/.exec(resolvedRelPath);
  return !!m && SPINE_DOC_NAMES.has(m[1] ?? '');
}

// Pull repo-relative markdown-file link targets out of a doc's body. Skips
// external URLs, mailto:, and pure anchors; strips trailing #anchors.
function extractDocLinks(content: string): string[] {
  const out: string[] = [];
  const re = /\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // Drop an optional markdown title: [x](./a.md "Title") → take the URL token.
    let t = (m[1] ?? '').trim().split(/\s+/)[0] ?? '';
    if (/^(https?:|mailto:|#)/i.test(t)) continue; // external / anchor (case-insensitive)
    t = (t.split('#')[0] ?? '').trim();
    if (!t || t.startsWith('/') || !t.endsWith('.md')) continue;
    out.push(t);
  }
  return out;
}

// Deeper content checks beyond "does the file exist": broken doc references,
// leftover scaffold TODOs, and content drift vs the recorded hash. All emitted
// as warnings (escalated to errors under --warnings-as-errors).
function contentIssues(repoPath: string, raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const docs = Array.isArray((raw as { docs?: unknown }).docs)
    ? ((raw as { docs: unknown[] }).docs as Array<Record<string, unknown>>)
    : [];

  for (const d of docs) {
    if (typeof d !== 'object' || d === null) continue; // tolerate a botched hand-edit (null/hole)
    const rel = typeof d.path === 'string' ? d.path : '';
    if (!rel.endsWith('.md')) continue;
    const abs = join(repoPath, rel);
    if (!existsSync(abs)) continue; // a missing indexed file is already a step-2 error
    let content: string;
    try {
      content = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }

    // (a) Broken internal references — links to .md files that don't exist.
    // Skip research/ and scripts/ (optional / agent-managed) and intentionally
    // mode-omitted spine docs.
    for (const target of extractDocLinks(content)) {
      const resolved = join(dirname(rel), target);
      if (resolved.startsWith('research/') || resolved.startsWith('scripts/')) continue;
      if (isOmittableSpineDoc(resolved)) continue;
      if (!existsSync(join(repoPath, resolved))) {
        issues.push({ severity: 'warning', path: rel, message: `links to \`${target}\` which doesn't exist on disk` });
      }
    }

    // (b) Leftover scaffold TODO markers in human/AI-owned docs. Generated docs
    // never carry them, so only flag the docs a human/agent is meant to fill.
    if (String(d.owner ?? '') !== 'generator' && /TODO:/.test(content)) {
      issues.push({ severity: 'warning', path: rel, message: 'still has unfilled TODO markers — run `docentic populate` or fill manually' });
    }

    // (c) Content drift vs the recorded hash. Dormant until a maintenance pass
    // records a real hash — a `pending` (fresh-scaffold) hash is skipped.
    const stored = typeof d.hash === 'string' ? d.hash : '';
    if (stored && stored !== 'pending') {
      const current = fileContentHash(abs);
      if (current && current !== stored) {
        issues.push({ severity: 'warning', path: rel, message: 'content changed since its recorded hash (drift) — regenerate or re-record' });
      }
    }
  }
  return issues;
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

  // 3. Deeper content checks (broken refs, leftover TODOs, hash drift) — only
  // meaningful once the required files exist, so run them after step 2.
  const deepIssues = contentIssues(repoPath, raw);

  // 4. Aggregate
  const allIssues = [...indexIssues, ...fileIssues, ...deepIssues];
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
