// `llm-docs init` — scaffold the template into a repo.

import { existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, basename, join } from 'node:path';
import { detectStack, autoDetectedDocs, generatorsSupport } from '../lib/detect-stack.js';
import { scaffold } from '../lib/scaffold.js';
import {
  isGitRepo,
  hasCommits,
  hasUncommittedChanges,
  currentBranch,
  createBranch,
  branchExists,
  stageFiles,
  commit,
  ensureEnvGitignored,
  ghAvailable,
  openPR,
  push,
  ensureLabel,
} from '../lib/git.js';
import { log } from '../lib/log.js';

export interface InitOptions {
  path?: string;
  dryRun?: boolean;
  force?: boolean;
  minimal?: boolean;
  spineOnly?: boolean;
  full?: boolean;
  forceIgnored?: boolean;
  noPr?: boolean;
  noCommit?: boolean;
  branch?: string;
}

export async function initCommand(opts: InitOptions): Promise<number> {
  const repoPath = resolve(opts.path ?? process.cwd());
  log.step(`docentic init`);
  log.dim(`  repo: ${repoPath}`);

  // 1. Validate target
  if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) {
    log.error(`Not a directory: ${repoPath}`);
    return 1;
  }
  if (!isGitRepo(repoPath)) {
    log.error(`Not a git repo: ${repoPath}`);
    log.dim(`  run \`git init\` first, or point at a real repo`);
    return 1;
  }

  // 2. Check working tree (skip in --dry-run or --no-commit modes — git state doesn't matter)
  if (!opts.dryRun && !opts.noCommit && hasUncommittedChanges(repoPath)) {
    log.error(`Working tree has uncommitted changes`);
    log.dim(`  commit or stash first, or use --no-commit to scaffold in place`);
    return 1;
  }

  // 3. Detect stack
  log.blank();
  log.step('Detecting stack…');
  const stack = detectStack(repoPath);
  const autoDocs = autoDetectedDocs(stack);

  log.dim(`  languages:       ${stack.languages.join(', ') || '(none detected)'}`);
  log.dim(`  framework:       ${stack.framework ?? '(none)'}`);
  log.dim(`  database:        ${stack.database ?? '(none)'}`);
  log.dim(`  package manager: ${stack.packageManager ?? '(none)'}`);
  log.dim(`  frontend:        ${stack.hasFrontend ? 'yes' : 'no'}`);
  log.dim(`  infra:           ${stack.hasInfra ? 'yes' : 'no'}`);
  log.dim(`  ml:              ${stack.hasML ? 'yes' : 'no'}`);
  log.dim(`  mobile:          ${stack.hasMobile ? 'yes' : 'no'}`);
  log.dim(`  auto-detected:   ${autoDocs.length > 0 ? autoDocs.join(', ') : '(none)'}`);
  log.dim(`  detected in:     ${stack.detectedIn.length > 0 ? stack.detectedIn.join(', ') : '(nothing found — generic scaffold)'}`);

  if (stack.languages.length === 0) {
    log.warn(`No languages detected — scaffold will be generic.`);
    log.dim(`  If this is a monorepo with code under a non-standard path, that path won't be auto-discovered.`);
    log.dim(`  Edit docs/STACK.md after scaffolding to fix.`);
  }

  // 4. Branch name (the branch itself is created at commit time, step 6 — so a
  // failure during scaffolding never strands the repo on an empty branch).
  const branchName = opts.branch ?? 'docentic/template-scaffold';
  // Pre-flight: if the target branch already exists and we're not on it, stop
  // BEFORE scaffolding. Otherwise we'd write ~30 files and only then fail at
  // `checkout -b`, leaving a half-scaffold on the user's current branch.
  if (!opts.dryRun && !opts.noCommit && hasCommits(repoPath)
      && currentBranch(repoPath) !== branchName && branchExists(repoPath, branchName)) {
    log.error(`Branch ${branchName} already exists.`);
    log.dim(`  Switch to it, delete it, or pass --branch <name> to use a different one.`);
    return 1;
  }

  // 5. Scaffold
  log.blank();
  log.step(opts.dryRun ? 'Dry run — would create:' : 'Scaffolding…');
  const repoName = basename(repoPath);
  const result = scaffold({
    repoPath,
    repoName,
    stack,
    minimal: opts.minimal,
    spineOnly: opts.spineOnly,
    full: opts.full,
    force: opts.force,
    forceIgnored: opts.forceIgnored,
    dryRun: opts.dryRun,
  });

  log.success(`${result.filesCreated.length} file(s) ${opts.dryRun ? 'would be created' : 'created'}`);
  if (result.filesCreated.length > 0 && (opts.dryRun || process.env.LLM_DOCS_VERBOSE === '1')) {
    log.list(result.filesCreated.slice(0, 50));
    if (result.filesCreated.length > 50) {
      log.dim(`  …and ${result.filesCreated.length - 50} more`);
    }
  }

  // Filter gitignored entries from the generic skipped list — they get a
  // dedicated block below with actionable fix-it instructions, so listing
  // them twice is noise.
  const gitignoredPaths = new Set(result.filesGitignored);
  const nonIgnoredSkips = result.filesSkipped.filter((s) => !gitignoredPaths.has(s.path));
  if (nonIgnoredSkips.length > 0) {
    log.warn(`${nonIgnoredSkips.length} file(s) skipped:`);
    log.list(nonIgnoredSkips.map((s) => `${s.path}  (${s.reason})`));
  }

  // Hard-stop if .gitignore would swallow scaffolded files. The scaffold is a
  // true pre-flight: when this fires, NOTHING was written — the repo is
  // untouched — so the user can fix .gitignore and re-run cleanly.
  if (result.filesGitignored.length > 0 && !opts.forceIgnored) {
    log.blank();
    log.error(`Halted: ${result.filesGitignored.length} scaffold file(s) would be ignored by .gitignore:`);
    log.list(result.filesGitignored);
    log.blank();
    log.dim(`  Nothing was written. To proceed, either:`);
    log.dim(`    (a) edit .gitignore to allow these paths (recommended — docentic files should be tracked), or`);
    log.dim(`    (b) re-run with --force-ignored to scaffold anyway (they'll still be ignored by git)`);
    return 1;
  }

  if (opts.dryRun) {
    log.blank();
    log.dim(`Dry run complete — no files written, no commit, no PR`);
    return 0;
  }

  // 5b. Fill the deterministic docs from code on the first run (supported
  // stacks only). The scaffold wrote placeholder STACK/API/DATA/MAP/INTEGRATIONS
  // docs; run the generators we just scaffolded so the first PR shows real
  // routes/models/deps instead of TODO stubs. Best-effort — never blocks init.
  const filled = fillGeneratedDocs(repoPath, stack, opts, result.filesCreated);
  if (filled.length > 0) {
    log.success(`Filled ${filled.length} doc(s) from your code: ${filled.join(', ')}`);
  }

  // Be explicit and TRUE about blast radius: we only add docs/config/tooling,
  // never application source. (Git side effects — branch, commit, PR — are
  // logged on their own lines below, so this stays honest in every mode.)
  log.dim(`  Only docs, config, and docentic's own scripts were added — your application code is untouched.`);

  if (opts.noCommit) {
    log.blank();
    log.success(`Files scaffolded; no commit (--no-commit)`);
    nextSteps(opts, filled);
    return 0;
  }

  // 6. Commit
  if (result.filesCreated.length === 0) {
    log.blank();
    log.warn(`Nothing was created — exiting without commit`);
    return 0;
  }

  log.blank();
  log.step('Committing…');
  try {
    // Create the branch now (not earlier): if anything above failed, the repo
    // was never moved off the user's branch. Guard the HEAD query for unborn
    // repos (`git init` with no commits yet) where there's no current branch.
    const onTarget = hasCommits(repoPath) && currentBranch(repoPath) === branchName;
    if (onTarget) {
      log.dim(`  already on ${branchName} — staying`);
    } else {
      const from = hasCommits(repoPath) ? currentBranch(repoPath) : null;
      createBranch(repoPath, branchName);
      log.success(from ? `Branched off ${from}` : `Created branch ${branchName}`);
    }

    // Protect the user's secrets: make sure `.env` is gitignored before we ever
    // commit, so a later `docentic populate` can't sweep a live API key in.
    const stagePaths = [...result.filesCreated];
    if (ensureEnvGitignored(repoPath)) {
      log.dim(`  added .env to .gitignore (keeps API keys out of git)`);
      stagePaths.push('.gitignore');
    }

    // Stage only the files we created (+ the .gitignore tweak) — never `git
    // add -A`, which could sweep in an un-ignored .env or unrelated changes.
    stageFiles(repoPath, stagePaths);
    const msg = commitMessage(repoName, stack, autoDocs, result.filesCreated.length, filled);
    commit(repoPath, msg);
    log.success(`Committed on ${branchName}`);
  } catch (err) {
    log.error(`Commit failed: ${(err as Error).message}`);
    return 1;
  }

  // 7. PR (optional)
  if (opts.noPr) {
    log.blank();
    log.dim(`Skipping PR creation (--no-pr)`);
    nextSteps(opts, filled);
    return 0;
  }

  if (!ghAvailable()) {
    log.warn(`gh CLI not found — skipping PR creation`);
    log.dim(`  install gh and run: cd ${repoPath} && gh pr create --title "..." --body "..."`);
    nextSteps(opts, filled);
    return 0;
  }

  log.blank();
  log.step('Opening PR…');
  try {
    push(repoPath, branchName);
    // Try to ensure the `docentic` label exists. If we can't create it
    // (no repo write perms, or the GH token can't write labels), open the PR
    // without the label rather than crashing the whole flow.
    const labelOk = ensureLabel(repoPath, 'docentic', {
      color: '7c3aed',
      description: 'Scaffolded by docentic — agent-friendly documentation',
    });
    if (!labelOk) {
      log.warn(`Could not ensure 'docentic' label on this repo — opening PR without it.`);
      log.dim(`  (gh CLI may lack write perms, or the repo blocks label create)`);
    }
    const url = openPR(repoPath, {
      title: 'chore: bootstrap docentic template',
      body: prBody(repoName, stack, autoDocs, result.filesCreated.length, filled),
      ...(labelOk ? { label: 'docentic' } : {}),
    });
    log.success(`PR opened: ${url}`);
  } catch (err) {
    log.error(`PR creation failed: ${(err as Error).message}`);
    log.dim(`  branch is committed; you can open the PR manually with gh pr create`);
  }

  nextSteps(opts, filled);
  return 0;
}

// Map the 5 generator-owned docs to the scripts that fill them. The order is
// the order they appear in the first PR.
const GENERATOR_DOCS: Array<{ script: string; doc: string }> = [
  { script: 'scripts/llm-docs/gen-stack.sh', doc: 'docs/STACK.md' },
  { script: 'scripts/llm-docs/gen-data.sh', doc: 'docs/DATA.md' },
  { script: 'scripts/llm-docs/gen-api.sh', doc: 'docs/API.md' },
  { script: 'scripts/llm-docs/gen-map.sh', doc: 'docs/MAP.md' },
  { script: 'scripts/llm-docs/gen-integrations.sh', doc: 'docs/INTEGRATIONS.md' },
];

// Every script that fill-on-first-run executes or transitively `source`s (each
// generator sources detect-stack.sh + the matching lang/<x>.sh adapter). We
// only run fill when we just wrote ALL of them from our own templates this run.
// If any pre-existed on disk and wasn't overwritten (no --force), it could be
// attacker-planted in a hostile repo — so we skip fill entirely rather than
// auto-execute a repo-resident script.
const SCAFFOLD_SCRIPTS = [
  'scripts/llm-docs/detect-stack.sh',
  'scripts/llm-docs/gen-stack.sh',
  'scripts/llm-docs/gen-data.sh',
  'scripts/llm-docs/gen-api.sh',
  'scripts/llm-docs/gen-map.sh',
  'scripts/llm-docs/gen-integrations.sh',
  'scripts/llm-docs/lang/python.sh',
  'scripts/llm-docs/lang/go.sh',
  'scripts/llm-docs/lang/ruby.sh',
  'scripts/llm-docs/lang/php.sh',
];

function bashAvailable(): boolean {
  try {
    execFileSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Run the deterministic generators against the freshly-scaffolded repo and
// write their output over the placeholder docs. Returns the short doc names
// that were filled (e.g. ['STACK.md', 'API.md']). Pure best-effort: any failure
// (no bash, missing jq, an unsupported layout) silently leaves the placeholder.
function fillGeneratedDocs(
  repoPath: string,
  stack: ReturnType<typeof detectStack>,
  opts: InitOptions,
  created: string[],
): string[] {
  // --minimal / --spine-only never scaffold these docs or their generators.
  if (opts.minimal || opts.spineOnly) return [];
  // On stacks without a deterministic generator, the scripts would emit empty
  // tables — leave the honest placeholder instead of fabricating content.
  if (!generatorsSupport(stack)) return [];
  if (!bashAvailable()) return [];

  const createdSet = new Set(created);
  // Security gate: never execute a script we didn't just write ourselves. If any
  // generator / detect-stack / lang adapter pre-existed on disk (so the scaffold
  // skipped it without --force), skip fill — on a hostile repo that file could be
  // attacker-planted, and the generators source it.
  if (!SCAFFOLD_SCRIPTS.every((s) => createdSet.has(s))) return [];

  const filled: string[] = [];
  for (const { script, doc } of GENERATOR_DOCS) {
    const scriptAbs = join(repoPath, script);
    const docAbs = join(repoPath, doc);
    // Only fill a doc the scaffold actually created this run, whose generator
    // is present on disk.
    if (!createdSet.has(doc) || !existsSync(scriptAbs) || !existsSync(docAbs)) continue;
    try {
      const out = execFileSync('bash', [scriptAbs], {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 20000,
        maxBuffer: 8 * 1024 * 1024,
      });
      // Guard against a generator that bailed and produced near-nothing.
      if (out && out.trim().length > 80) {
        writeFileSync(docAbs, out, 'utf-8');
        filled.push(doc.replace(/^docs\//, ''));
      }
    } catch {
      // Generator failed — leave the placeholder. init must never fail because
      // a generator did.
    }
  }
  return filled;
}

function nextSteps(opts: InitOptions, filled: string[] = []): void {
  log.blank();
  log.step('Next steps:');
  log.dim(`  1. Review the scaffold (or PR if one was opened)`);
  if (filled.length > 0) {
    log.dim(`     ${filled.join(', ')} ${filled.length === 1 ? 'was' : 'were'} auto-filled from your code — skim for accuracy.`);
  }
  log.dim(`  2. Fill the remaining TODOs in AGENTS.md + the manual docs/*:`);
  log.dim(`       → in an agent with repo filesystem access (Claude Code, Cursor agent,`);
  log.dim(`         Codex CLI, Gemini CLI…), paste prompts/bootstrap.md from the docentic repo`);
  log.dim(`       → or 'docentic populate' (uses an API key from .env)`);
  if (opts.full) {
    log.dim(`  3. Propose research topics with prompts/config-seeder.md`);
    log.dim(`  4. Merge, then schedule the daily maintenance loop (scripts/llm-docs/MAINTAIN.md)`);
  } else {
    log.dim(`  3. Merge. Want the daily research loop too? Re-run with --full.`);
  }
  log.blank();
  log.dim(`  Tip: 'docentic init' is safe to re-run — existing files are skipped`);
  log.dim(`       unless --force is passed. Use it to pick up template updates.`);
}

function commitMessage(
  repoName: string,
  stack: ReturnType<typeof detectStack>,
  autoDocs: string[],
  fileCount: number,
  filled: string[],
): string {
  const filledLine = filled.length > 0
    ? `${filled.join(', ')} were auto-filled from your code. `
    : '';
  return `chore: scaffold docentic template (${fileCount} files)

Scaffolded by docentic (@intrepideai/docentic).
Your agent guide through any codebase.

Detected stack: ${stack.labels.join(', ') || '(generic)'}
Auto-detected docs: ${autoDocs.length > 0 ? autoDocs.join(', ') : '(none)'}

Only docs, config, and docentic's own scripts were added — no
application code was changed. ${filledLine}AGENTS.md and the manual
docs/* still have TODO markers; to fill them, either:

  (a) paste prompts/bootstrap.md (from the docentic repo) into any
      LLM with read access to this repo, or
  (b) run \`docentic populate\` with an API key in .env

Co-Authored-By: docentic <clyde@intrepide.ai>`;
}

function prBody(
  repoName: string,
  stack: ReturnType<typeof detectStack>,
  autoDocs: string[],
  fileCount: number,
  filled: string[],
): string {
  const filledBlock = filled.length > 0
    ? `## Already filled from your code

These were generated from the actual codebase — skim them for accuracy:

${filled.map((d) => `- \`docs/${d}\``).join('\n')}
`
    : '';
  return `## What this is

Scaffold of the agent-friendly docs template, added by [\`docentic\`](https://github.com/intrepideai/docentic) — your agent guide through any codebase.

${fileCount} files created. Only docs, config, and docentic's own scripts were added — **no application code was changed.**

## Detected stack

- **Labels:** ${stack.labels.join(', ') || '(generic)'}
- **Languages:** ${stack.languages.join(', ') || '(none)'}
- **Framework:** ${stack.framework ?? '(none)'}
- **Database:** ${stack.database ?? '(none)'}
- **Package manager:** ${stack.packageManager ?? '(none)'}

## Auto-detected docs

${autoDocs.length > 0 ? autoDocs.map((d) => `- \`docs/${d}\``).join('\n') : '(none — repo has no frontend/infra/ML/mobile signal)'}

${filledBlock}## Still needs filling

- \`AGENTS.md\` and the manual \`docs/*\` files — scaffolded with TODOs and frontmatter

Run the **Bootstrap prompt** ([prompts/bootstrap.md](https://github.com/intrepideai/docentic/blob/main/prompts/bootstrap.md)) after this PR merges, or use \`docentic populate\` to do it automatically with an API key in \`.env\`.

## Review checklist

- [ ] File tree looks right
- [ ] Stack detection matches reality (otherwise auto-detected docs may be wrong)
- [ ] No naming collisions with existing \`docs/\` directory or other repo conventions
- [ ] Ready to run the Bootstrap agent after merge

---

Generated by [docentic](https://github.com/intrepideai/docentic).
`;
}
