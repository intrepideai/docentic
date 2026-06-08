// CLI integration tests — exercise the built dist/cli.js against throwaway git
// repos. These lock in the Phase-1 safety/contract fixes (secret-safety,
// git-correctness, and the check/index contract) so they can't silently
// regress. Run with `npm test`.
//
// Requires: a build (`npm run build`) and `git` on PATH.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
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

// --- Pre-launch polish (v0.4.0): version, lean default, fill-on-first-run, real check ---

test('--version reports the package.json version (no hardcoded drift)', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  const res = runCli(['--version'], process.cwd());
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), pkg.version, 'CLI --version must equal package.json version');
});

test('lean default omits the research pipeline but keeps the generators', () => {
  const repo = makeRepo({ 'package.json': '{"name":"t","dependencies":{"express":"^4"}}' });
  try {
    assert.equal(runCli(['init', repo, '--no-commit'], repo).status, 0);
    assert.ok(!existsSync(join(repo, 'research')), 'default must not scaffold research/');
    assert.ok(!existsSync(join(repo, 'scripts', 'llm-docs', 'prompts', 'scouts')), 'default must not scaffold scout prompts');
    assert.ok(existsSync(join(repo, 'scripts', 'llm-docs', 'gen-stack.sh')), 'default keeps the deterministic generators');
    // The AGENTS.md research row is omitted so there's no dead pointer.
    assert.ok(!/Research library/.test(readFileSync(join(repo, 'AGENTS.md'), 'utf-8')), 'lean AGENTS.md has no research row');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('--full scaffolds the research pipeline and the AGENTS.md research row', () => {
  const repo = makeRepo();
  try {
    assert.equal(runCli(['init', repo, '--no-commit', '--full'], repo).status, 0);
    assert.ok(existsSync(join(repo, 'research')), '--full scaffolds research/');
    assert.ok(existsSync(join(repo, 'scripts', 'llm-docs', 'prompts', 'scouts')), '--full scaffolds scout prompts');
    assert.ok(/Research library/.test(readFileSync(join(repo, 'AGENTS.md'), 'utf-8')), '--full AGENTS.md has the research row');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('init scaffolds a CLAUDE.md that imports AGENTS.md', () => {
  const repo = makeRepo();
  try {
    runCli(['init', repo, '--no-commit'], repo);
    const claude = join(repo, 'CLAUDE.md');
    assert.ok(existsSync(claude), 'CLAUDE.md should be scaffolded');
    assert.match(readFileSync(claude, 'utf-8'), /@AGENTS\.md/, 'CLAUDE.md should import AGENTS.md');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('init fills generated docs from code on a supported stack', () => {
  // The generators need bash + jq. Skip the content assertions if absent so the
  // test stays green on a bare box; init must still exit 0 either way.
  let haveTools = false;
  try { execFileSync('bash', ['-lc', 'command -v jq'], { stdio: 'ignore' }); haveTools = true; } catch {}
  const repo = makeRepo({ 'package.json': '{"name":"t","version":"1.2.3","dependencies":{"express":"^4","drizzle-orm":"^0.30"}}' });
  try {
    assert.equal(runCli(['init', repo, '--no-commit'], repo).status, 0);
    const stack = readFileSync(join(repo, 'docs', 'STACK.md'), 'utf-8');
    if (haveTools) {
      assert.ok(!/Still seeing this note/.test(stack), 'STACK.md should be filled, not the placeholder');
      assert.match(stack, /1\.2\.3/, 'STACK.md should contain the real version from package.json');
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('init never executes a pre-planted generator script (no auto-ACE on a hostile repo)', () => {
  // A repo that ships its own malicious scripts/llm-docs/gen-stack.sh. The
  // scaffold skips it (already exists, no --force); fill-on-first-run must NOT
  // run it. The sentinel it would create must be absent.
  const repo = makeRepo({ 'package.json': '{"name":"evil","dependencies":{"express":"^4"}}' });
  try {
    mkdirSync(join(repo, 'scripts', 'llm-docs'), { recursive: true });
    writeFileSync(join(repo, 'scripts', 'llm-docs', 'gen-stack.sh'), '#!/usr/bin/env bash\ntouch "$PWD/PWNED"\necho pwned\n');
    git(['add', '-A'], repo);
    git(['commit', '-qm', 'plant'], repo);
    assert.equal(runCli(['init', repo, '--no-commit'], repo).status, 0);
    assert.ok(!existsSync(join(repo, 'PWNED')), 'a pre-planted generator must never be executed by init');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('init does not fabricate generated docs on an unsupported stack', () => {
  const repo = makeRepo({ 'Cargo.toml': '[package]\nname = "r"\nversion = "0.1.0"\n' });
  try {
    assert.equal(runCli(['init', repo, '--no-commit'], repo).status, 0, 'init must not crash on an unsupported stack');
    const stack = readFileSync(join(repo, 'docs', 'STACK.md'), 'utf-8');
    assert.match(stack, /Still seeing this note/, 'unsupported stack keeps the honest placeholder');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('check warns on unfilled TODOs by default but fails under --warnings-as-errors', () => {
  const repo = makeRepo();
  try {
    runCli(['init', repo, '--no-commit'], repo);
    const res = runCli(['check', repo, '--json'], repo);
    assert.equal(res.status, 0, 'a fresh, unfilled scaffold still passes check (warnings only)');
    const report = JSON.parse(res.stdout);
    assert.ok(report.warnings.some((w) => /TODO/.test(w.message)), 'should warn about leftover TODOs');
    assert.notEqual(runCli(['check', repo, '--warnings-as-errors'], repo).status, 0, 'strict mode fails on warnings');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('check does not crash on a null element in docs[] (still emits JSON)', () => {
  const repo = makeRepo();
  try {
    runCli(['init', repo, '--no-commit'], repo);
    const idxPath = join(repo, '.agents', 'index.json');
    const idx = JSON.parse(readFileSync(idxPath, 'utf-8'));
    idx.docs.push(null); // a botched hand-edit / programmatic hole
    writeFileSync(idxPath, JSON.stringify(idx, null, 2));
    const res = runCli(['check', repo, '--json'], repo);
    // Must NOT throw a Fatal — and --json must still produce parseable JSON.
    assert.doesNotThrow(() => JSON.parse(res.stdout), 'check --json must emit valid JSON even with a null doc');
    assert.ok(!/Cannot read properties of null/.test(res.stdout), 'must not surface a TypeError');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('check flags a broken internal doc reference', () => {
  const repo = makeRepo();
  try {
    runCli(['init', repo, '--no-commit'], repo);
    const agents = join(repo, 'AGENTS.md');
    writeFileSync(agents, readFileSync(agents, 'utf-8') + '\n[gone](./docs/DOESNOTEXIST.md)\n');
    const report = JSON.parse(runCli(['check', repo, '--json'], repo).stdout);
    assert.ok(report.warnings.some((w) => /DOESNOTEXIST/.test(w.message)), 'broken .md link should warn');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
