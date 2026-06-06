// CLI integration tests — exercise the built dist/cli.js against throwaway git
// repos. These lock in the Phase-1 safety/contract fixes (secret-safety,
// git-correctness, and the check/index contract) so they can't silently
// regress. Run with `npm test`.
//
// Requires: a build (`npm run build`) and `git` on PATH.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

// Create a throwaway git repo with the given root files. Returns its path.
function makeRepo(files = { 'package.json': '{"name":"t"}' }, { commit = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'docentic-test-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 't@t.co'], dir);
  git(['config', 'user.name', 't'], dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  if (commit && Object.keys(files).length > 0) {
    git(['add', '-A'], dir);
    git(['commit', '-qm', 'init'], dir);
  }
  return dir;
}

// Run the CLI. Returns { status, stdout } and never throws on non-zero exit.
function runCli(args, cwd) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status ?? 1, stdout: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

test('check passes on a full scaffold', () => {
  const repo = makeRepo({ 'package.json': '{"name":"t","dependencies":{"next":"^15"}}' });
  try {
    assert.equal(runCli(['init', repo, '--no-commit'], repo).status, 0);
    assert.equal(runCli(['check', repo], repo).status, 0, 'check should pass on a fresh full scaffold');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('--minimal scaffold passes check (index reflects scaffolded set)', () => {
  const repo = makeRepo();
  try {
    assert.equal(runCli(['init', repo, '--no-commit', '--minimal'], repo).status, 0);
    // Regression: previously check hardcoded 13 spine files and a --minimal repo
    // failed with 22 errors. Now the required set is derived from index.json.
    const res = runCli(['check', repo], repo);
    assert.equal(res.status, 0, `check should pass on --minimal scaffold; got:\n${res.stdout}`);
    // The index must NOT list the docs minimal skipped (e.g. STACK.md).
    const idx = JSON.parse(readFileSync(join(repo, '.agents', 'index.json'), 'utf-8'));
    const paths = idx.docs.map((d) => d.path);
    assert.ok(paths.includes('AGENTS.md'));
    assert.ok(!paths.includes('docs/STACK.md'), 'minimal index should not list docs/STACK.md');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('check rejects an index with an unknown key (schema parity)', () => {
  const repo = makeRepo();
  try {
    runCli(['init', repo, '--no-commit'], repo);
    const idxPath = join(repo, '.agents', 'index.json');
    const idx = JSON.parse(readFileSync(idxPath, 'utf-8'));
    idx.bogus_field = 123;
    writeFileSync(idxPath, JSON.stringify(idx, null, 2));
    assert.notEqual(runCli(['check', repo], repo).status, 0, 'unknown top-level key must fail check');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('check fails on corrupt index.json', () => {
  const repo = makeRepo();
  try {
    runCli(['init', repo, '--no-commit'], repo);
    writeFileSync(join(repo, '.agents', 'index.json'), '{ broken');
    assert.notEqual(runCli(['check', repo], repo).status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('init gitignores .env so a live key can never be staged', () => {
  const repo = makeRepo();
  try {
    assert.equal(runCli(['init', repo, '--no-pr'], repo).status, 0);
    // .env must be ignored now…
    assert.doesNotThrow(() => git(['check-ignore', '.env'], repo), '.env should be gitignored after init');
    // …so even after the user writes a key, git can't see it.
    writeFileSync(join(repo, '.env'), 'ANTHROPIC_API_KEY=sk-ant-LEAK');
    const status = git(['status', '--porcelain'], repo);
    assert.ok(!/\.env$/m.test(status), `.env must be invisible to git; status was:\n${status}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('--branch cannot inject shell commands', () => {
  const repo = makeRepo();
  try {
    // Under the old string-interpolated execSync this ran `touch INJECTED`.
    runCli(['init', repo, '--no-pr', '--branch', 'x$(touch INJECTED)'], repo);
    assert.ok(!existsSync(join(repo, 'INJECTED')), 'command substitution must not execute');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('init on an empty unborn repo commits without crashing', () => {
  // git init, no commits, no files — the #51 repro.
  const repo = mkdtempSync(join(tmpdir(), 'docentic-test-'));
  git(['init', '-q'], repo);
  git(['config', 'user.email', 't@t.co'], repo);
  git(['config', 'user.name', 't'], repo);
  try {
    const res = runCli(['init', repo, '--no-pr'], repo);
    assert.ok(!/ambiguous argument 'HEAD'/.test(res.stdout), 'must not crash on unborn HEAD');
    assert.equal(res.status, 0);
    assert.doesNotThrow(() => git(['rev-parse', 'HEAD'], repo), 'a first commit should exist');
    assert.equal(git(['rev-parse', '--abbrev-ref', 'HEAD'], repo), 'docentic/template-scaffold');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('gitignore conflict is a true pre-flight — nothing is written', () => {
  const repo = makeRepo({ 'package.json': '{"name":"t"}', '.gitignore': 'AGENTS.md\ndocs/\n' });
  try {
    const res = runCli(['init', repo, '--no-commit'], repo);
    assert.notEqual(res.status, 0, 'should exit non-zero on gitignore conflict');
    assert.ok(!existsSync(join(repo, 'AGENTS.md')), 'ignored file not written');
    // The key fix: non-ignored files are ALSO not written (no half-scaffold).
    assert.ok(!existsSync(join(repo, '.agents', 'index.json')), 'non-ignored file also not written');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
