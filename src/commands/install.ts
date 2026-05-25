// `docent install` — install the docent skill into Claude Code and/or Cursor.
//
// Detects which agents the user has installed (by checking for ~/.claude/ and
// ~/.cursor/) and copies the appropriate skill files into place.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { log } from '../lib/log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// skills/ lives at the package root (next to templates/), copied via the package "files" field
const SKILLS_DIR = resolve(__dirname, '..', '..', 'skills');

export interface InstallOptions {
  claude?: boolean;
  cursor?: boolean;
  project?: string;      // For Cursor: install per-project instead of globally
  force?: boolean;       // Overwrite if already installed
  dryRun?: boolean;
}

interface InstallResult {
  installed: { target: string; from: string; to: string }[];
  skipped: { target: string; reason: string }[];
  failed: { target: string; error: string }[];
}

function copyWithDirs(src: string, dst: string, dryRun: boolean): void {
  if (!dryRun) {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
}

function detectClaude(): boolean {
  return existsSync(join(homedir(), '.claude'));
}

function detectCursor(): boolean {
  return existsSync(join(homedir(), '.cursor'));
}

function installClaude(opts: InstallOptions, result: InstallResult): void {
  const src = join(SKILLS_DIR, 'claude', 'SKILL.md');
  const dst = join(homedir(), '.claude', 'skills', 'docent', 'SKILL.md');

  if (!existsSync(src)) {
    result.failed.push({ target: 'claude', error: `skill source missing: ${src}` });
    return;
  }
  if (existsSync(dst) && !opts.force) {
    result.skipped.push({ target: 'claude', reason: `already installed at ${dst} (use --force to overwrite)` });
    return;
  }
  try {
    copyWithDirs(src, dst, opts.dryRun ?? false);
    result.installed.push({ target: 'claude', from: src, to: dst });
  } catch (err) {
    result.failed.push({ target: 'claude', error: (err as Error).message });
  }
}

function installCursor(opts: InstallOptions, result: InstallResult): void {
  const src = join(SKILLS_DIR, 'cursor', 'docent.mdc');
  const dst = opts.project
    ? join(resolve(opts.project), '.cursor', 'rules', 'docent.mdc')
    : join(homedir(), '.cursor', 'rules', 'docent.mdc');

  if (!existsSync(src)) {
    result.failed.push({ target: 'cursor', error: `skill source missing: ${src}` });
    return;
  }
  if (existsSync(dst) && !opts.force) {
    result.skipped.push({ target: 'cursor', reason: `already installed at ${dst} (use --force to overwrite)` });
    return;
  }
  try {
    copyWithDirs(src, dst, opts.dryRun ?? false);
    result.installed.push({ target: 'cursor', from: src, to: dst });
  } catch (err) {
    result.failed.push({ target: 'cursor', error: (err as Error).message });
  }
}

export async function installCommand(opts: InstallOptions): Promise<number> {
  // If neither flag given, install for whatever's detected
  const claudeRequested = opts.claude ?? (!opts.claude && !opts.cursor && detectClaude());
  const cursorRequested = opts.cursor ?? (!opts.claude && !opts.cursor && detectCursor());

  if (!claudeRequested && !cursorRequested) {
    log.warn('No agents detected (no ~/.claude/ and no ~/.cursor/).');
    log.dim('  Pass --claude or --cursor explicitly if you want to install anyway.');
    return 1;
  }

  log.step(opts.dryRun ? 'docent install — DRY RUN' : 'docent install');
  log.blank();

  const result: InstallResult = { installed: [], skipped: [], failed: [] };

  if (claudeRequested) installClaude(opts, result);
  if (cursorRequested) installCursor(opts, result);

  // Report
  for (const r of result.installed) {
    log.success(`${r.target}: ${opts.dryRun ? 'would install' : 'installed'} → ${tildify(r.to)}`);
  }
  for (const r of result.skipped) {
    log.warn(`${r.target}: ${r.reason}`);
  }
  for (const r of result.failed) {
    log.error(`${r.target}: ${r.error}`);
  }

  if (result.installed.length > 0 && !opts.dryRun) {
    log.blank();
    log.step('What to try next:');
    if (result.installed.some((r) => r.target === 'claude')) {
      log.dim('  In Claude Code:  "docent this repo" or "make this repo agent-friendly"');
    }
    if (result.installed.some((r) => r.target === 'cursor')) {
      log.dim('  In Cursor:       same — say "docent this repo" in the chat');
    }
    log.dim('  Or directly:    docent init');
  }

  return result.failed.length === 0 ? 0 : 1;
}

function tildify(p: string): string {
  const home = homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}
