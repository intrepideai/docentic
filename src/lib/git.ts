// Git helpers — branch creation, commit, PR.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class GitError extends Error {
  constructor(message: string, public stderr?: string) {
    super(message);
  }
}

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: Buffer };
    throw new GitError(e.message ?? `failed: ${cmd}`, e.stderr?.toString());
  }
}

export function isGitRepo(repoPath: string): boolean {
  return existsSync(join(repoPath, '.git'));
}

export function currentBranch(repoPath: string): string {
  return run('git rev-parse --abbrev-ref HEAD', repoPath);
}

export function hasUncommittedChanges(repoPath: string): boolean {
  return run('git status --porcelain', repoPath).length > 0;
}

export function createBranch(repoPath: string, name: string): void {
  run(`git checkout -b "${name}"`, repoPath);
}

export function addAll(repoPath: string): void {
  run('git add -A', repoPath);
}

export function commit(repoPath: string, message: string): void {
  // Use heredoc-style stdin to safely pass multiline messages
  execSync(`git commit -F -`, {
    cwd: repoPath,
    input: message,
    encoding: 'utf-8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

export function push(repoPath: string, branch: string): void {
  run(`git push -u origin "${branch}"`, repoPath);
}

export function openPR(
  repoPath: string,
  options: { title: string; body: string; base?: string; label?: string },
): string {
  // Use gh CLI; pipe body via stdin
  const base = options.base ?? 'main';
  const labelArg = options.label ? `--label "${options.label}"` : '';
  const titleEscaped = options.title.replaceAll('"', '\\"');
  const out = execSync(
    `gh pr create --title "${titleEscaped}" --body-file - --base "${base}" ${labelArg}`,
    {
      cwd: repoPath,
      input: options.body,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  ).trim();
  return out;
}

export function ghAvailable(): boolean {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check whether a given GitHub label exists on the current repo.
// Requires `gh` CLI authenticated and run from inside the repo.
export function labelExists(repoPath: string, label: string): boolean {
  try {
    const out = execSync(
      `gh label list --search "${label}" --json name --jq '.[] | select(.name == "${label}") | .name'`,
      { cwd: repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    return out.length > 0;
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
    execSync(
      `gh label create "${label}" --color "${options.color}" --description "${options.description.replaceAll('"', '\\"')}"`,
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
    const out = execSync(`git check-ignore --stdin --no-index`, {
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
