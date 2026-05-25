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
