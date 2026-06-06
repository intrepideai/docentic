// Git helpers — branch creation, commit, PR.
//
// Every git/gh invocation goes through execFileSync with an argv array — never
// string interpolation into a shell. This makes branch names, labels, and PR
// titles injection-proof (a `--branch 'x$(rm -rf .)'` is passed as one literal
// argument, never evaluated by a shell).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class GitError extends Error {
  constructor(message: string, public stderr?: string) {
    super(message);
  }
}

function git(args: string[], cwd: string, input?: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      input,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: Buffer | string };
    throw new GitError(e.message ?? `git ${args.join(' ')} failed`, e.stderr?.toString());
  }
}

export function isGitRepo(repoPath: string): boolean {
  return existsSync(join(repoPath, '.git'));
}

// True if the repo has at least one commit. False on an unborn branch
// (`git init` with nothing committed yet). Callers must guard HEAD/branch
// queries with this — `git rev-parse --abbrev-ref HEAD` throws
// `fatal: ambiguous argument 'HEAD'` on an unborn repo.
export function hasCommits(repoPath: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

export function currentBranch(repoPath: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
}

export function hasUncommittedChanges(repoPath: string): boolean {
  return git(['status', '--porcelain'], repoPath).length > 0;
}

export function createBranch(repoPath: string, name: string): void {
  git(['checkout', '-b', name], repoPath);
}

// True if a local branch `name` already exists. Used as a pre-flight so we can
// refuse early (before writing anything) rather than scaffolding files and then
// failing at `checkout -b`, which would strand a half-written tree.
export function branchExists(repoPath: string, name: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

// Stage an explicit set of paths. The CLI flows use this instead of
// `git add -A` so a stray un-ignored `.env` (live API key) can never be swept
// into a docentic commit. Paths are relative to repoPath.
export function stageFiles(repoPath: string, paths: string[]): void {
  if (paths.length === 0) return;
  git(['add', '--', ...paths], repoPath);
}

export function commit(repoPath: string, message: string): void {
  // Pass the message via stdin (-F -) so multiline bodies and quotes are safe.
  git(['commit', '-F', '-'], repoPath, message);
}

export function push(repoPath: string, branch: string): void {
  git(['push', '-u', 'origin', branch], repoPath);
}

export function openPR(
  repoPath: string,
  options: { title: string; body: string; base?: string; label?: string },
): string {
  // Omit --base unless the caller explicitly provides one: `gh` then targets
  // the repo's real default branch (main/master/develop/trunk) instead of a
  // hardcoded 'main' that fails on every non-main repo.
  const args = ['pr', 'create', '--title', options.title, '--body-file', '-'];
  if (options.base) args.push('--base', options.base);
  if (options.label) args.push('--label', options.label);
  try {
    return execFileSync('gh', args, {
      cwd: repoPath,
      input: options.body,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: Buffer | string };
    throw new GitError(e.message ?? 'gh pr create failed', e.stderr?.toString());
  }
}

export function ghAvailable(): boolean {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check whether a given GitHub label exists on the current repo.
// Requires `gh` CLI authenticated and run from inside the repo.
export function labelExists(repoPath: string, label: string): boolean {
  try {
    const out = execFileSync(
      'gh',
      ['label', 'list', '--search', label, '--json', 'name', '--jq', '.[].name'],
      { cwd: repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    return out.split('\n').map((s) => s.trim()).includes(label);
  } catch {
    return false;
  }
}

// Try to create a label. Returns true on success, false if the create failed
// (e.g. no write perms on the repo). Doesn't throw.
export function createLabel(
  repoPath: string,
  label: string,
  options: { color: string; description: string },
): boolean {
  try {
    execFileSync(
      'gh',
      ['label', 'create', label, '--color', options.color, '--description', options.description],
      { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return true;
  } catch {
    return false;
  }
}

// Ensure a label exists on the repo. If it already exists, returns true.
// If missing, tries to create it. Returns whether the label is usable.
// Never throws — callers can decide to drop the label gracefully.
export function ensureLabel(
  repoPath: string,
  label: string,
  options: { color: string; description: string },
): boolean {
  if (labelExists(repoPath, label)) return true;
  return createLabel(repoPath, label, options);
}

// Run `git check-ignore` over a list of paths. Returns the subset that are
// currently gitignored. Paths must be relative to repoPath.
export function filterIgnored(repoPath: string, relativePaths: string[]): string[] {
  if (relativePaths.length === 0) return [];
  try {
    // git check-ignore exits 0 if any of the paths are ignored, 1 if none, 128 on error.
    // We pipe paths via --stdin so we don't blow ARG_MAX on big scaffolds.
    const out = execFileSync('git', ['check-ignore', '--stdin', '--no-index'], {
      cwd: repoPath,
      input: relativePaths.join('\n'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.trim().split('\n').filter(Boolean);
  } catch (err: unknown) {
    // exit code 1 = no paths matched (success case for us — nothing ignored)
    const e = err as { status?: number };
    if (e.status === 1) return [];
    // Any other error: assume nothing is ignored rather than blocking the scaffold
    return [];
  }
}

// Ensure `.env` (and common variants) are gitignored so neither `docentic
// populate` nor a re-run of `init` can ever stage a live API key. Returns true
// if it modified .gitignore, false if `.env` was already ignored. Safe to call
// repeatedly (idempotent).
export function ensureEnvGitignored(repoPath: string): boolean {
  // If git already ignores `.env` (via any pattern — `.env`, `*.env`, `.env*`),
  // there's nothing to do.
  if (filterIgnored(repoPath, ['.env']).length > 0) return false;

  const giPath = join(repoPath, '.gitignore');
  const existing = existsSync(giPath) ? readFileSync(giPath, 'utf-8') : '';
  const patterns = ['.env', '.env.local', '.env.*.local'];
  const known = new Set(existing.split('\n').map((l) => l.trim()));
  const toAdd = patterns.filter((p) => !known.has(p));
  if (toAdd.length === 0) return false;

  const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  const block = `${sep}\n# Secrets — added by docentic so \`docentic populate\` never commits your API key\n${toAdd.join('\n')}\n`;
  writeFileSync(giPath, existing + block, 'utf-8');
  return true;
}
