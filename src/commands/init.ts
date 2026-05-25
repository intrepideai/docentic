// `llm-docs init` — scaffold the template into a repo.

import { existsSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { detectStack, autoDetectedDocs } from '../lib/detect-stack.js';
import { scaffold } from '../lib/scaffold.js';
import {
  isGitRepo,
  hasUncommittedChanges,
  currentBranch,
  createBranch,
  addAll,
  commit,
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

  // 4. Branch
  const branchName = opts.branch ?? 'docentic/template-scaffold';
  if (!opts.dryRun && !opts.noCommit) {
    if (currentBranch(repoPath) === branchName) {
      log.warn(`Already on ${branchName} — staying`);
    } else {
      log.blank();
      log.step(`Creating branch ${branchName}…`);
      try {
        createBranch(repoPath, branchName);
        log.success(`Branched off main`);
      } catch (err) {
        log.error(`Failed to create branch: ${(err as Error).message}`);
        log.dim(`  if it already exists, switch to it or pick a different name with --branch`);
        return 1;
      }
    }
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

  // Hard-stop if .gitignore would swallow scaffolded files. We'd rather make
  // the user notice and fix it than ship a commit that's missing AGENTS.md.
  if (result.filesGitignored.length > 0 && !opts.forceIgnored) {
    log.blank();
    log.error(`${result.filesGitignored.length} file(s) would be ignored by .gitignore:`);
    log.list(result.filesGitignored);
    log.blank();
    log.dim(`  These files were NOT written. To fix, either:`);
    log.dim(`    (a) edit .gitignore to allow them (recommended — docentic files should be tracked), or`);
    log.dim(`    (b) re-run with --force-ignored to scaffold anyway (they'll still be ignored by git)`);
    return 1;
  }

  if (opts.dryRun) {
    log.blank();
    log.dim(`Dry run complete — no files written, no commit, no PR`);
    return 0;
  }

  if (opts.noCommit) {
    log.blank();
    log.success(`Files scaffolded; no commit (--no-commit)`);
    nextSteps(opts);
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
    addAll(repoPath);
    const msg = commitMessage(repoName, stack, autoDocs, result.filesCreated.length);
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
    nextSteps(opts);
    return 0;
  }

  if (!ghAvailable()) {
    log.warn(`gh CLI not found — skipping PR creation`);
    log.dim(`  install gh and run: cd ${repoPath} && gh pr create --title "..." --body "..."`);
    nextSteps(opts);
    return 0;
  }

  log.blank();
  log.step('Opening PR…');
  try {
    push(repoPath, branchName);
    // Try to ensure the `llm-docs` label exists. If we can't create it
    // (no repo write perms, or the GH token can't write labels), open the PR
    // without the label rather than crashing the whole flow.
    const labelOk = ensureLabel(repoPath, 'llm-docs', {
      color: '7c3aed',
      description: 'Scaffolded by docentic — agent-friendly documentation',
    });
    if (!labelOk) {
      log.warn(`Could not ensure 'llm-docs' label on this repo — opening PR without it.`);
      log.dim(`  (gh CLI may lack write perms, or the repo blocks label create)`);
    }
    const url = openPR(repoPath, {
      title: 'chore: bootstrap docentic template',
      body: prBody(repoName, stack, autoDocs, result.filesCreated.length),
      ...(labelOk ? { label: 'llm-docs' } : {}),
    });
    log.success(`PR opened: ${url}`);
  } catch (err) {
    log.error(`PR creation failed: ${(err as Error).message}`);
    log.dim(`  branch is committed; you can open the PR manually with gh pr create`);
  }

  nextSteps(opts);
  return 0;
}

function nextSteps(opts: InitOptions): void {
  log.blank();
  log.step('Next steps:');
  log.dim(`  1. Review the scaffold (or PR if one was opened)`);
  log.dim(`  2. Fill in AGENTS.md + docs/* TODOs:`);
  log.dim(`       → in an agent with repo filesystem access (Claude Code, Cursor agent,`);
  log.dim(`         Codex CLI, Gemini CLI…), paste prompts/bootstrap.md from the docentic repo`);
  log.dim(`       → or 'docentic populate' (uses ANTHROPIC_API_KEY from .env)`);
  log.dim(`  3. Propose research topics with prompts/config-seeder.md`);
  log.dim(`  4. Merge, then schedule the 7 maintenance prompts (see prompts/ folder)`);
  log.blank();
  log.dim(`  Tip: 'docentic init' is safe to re-run — existing files are skipped`);
  log.dim(`       unless --force is passed. Use it to pick up template updates.`);
}

function commitMessage(
  repoName: string,
  stack: ReturnType<typeof detectStack>,
  autoDocs: string[],
  fileCount: number,
): string {
  return `chore: scaffold docentic template (${fileCount} files)

Scaffolded by docentic (@intrepideai/docentic).
Your agent guide through any codebase.

Detected stack: ${stack.labels.join(', ') || '(generic)'}
Auto-detected docs: ${autoDocs.length > 0 ? autoDocs.join(', ') : '(none)'}

This is the deterministic scaffold only. To fill in AGENTS.md and
docs/* TODOs with real content, either:

  (a) paste prompts/bootstrap.md (from the docentic repo) into any
      LLM with read access to this repo, or
  (b) run \`docentic populate\` with an API key in .env (coming soon)

Then run the Config Seeder (prompts/config-seeder.md) to propose
topics for research/config.yml.

Co-Authored-By: docentic <clyde@intrepide.ai>`;
}

function prBody(
  repoName: string,
  stack: ReturnType<typeof detectStack>,
  autoDocs: string[],
  fileCount: number,
): string {
  return `## What this is

Deterministic scaffold of the Intrepide agent-friendly docs template, generated by [\`docentic\`](https://github.com/intrepideai/docentic) — your agent guide through any codebase.

${fileCount} files created.

## Detected stack

- **Labels:** ${stack.labels.join(', ') || '(generic)'}
- **Languages:** ${stack.languages.join(', ') || '(none)'}
- **Framework:** ${stack.framework ?? '(none)'}
- **Database:** ${stack.database ?? '(none)'}
- **Package manager:** ${stack.packageManager ?? '(none)'}

## Auto-detected docs

${autoDocs.length > 0 ? autoDocs.map((d) => `- \`docs/${d}\``).join('\n') : '(none — repo has no frontend/infra/ML/mobile signal)'}

## What's NOT in this PR

- Real content for \`AGENTS.md\` and \`docs/*\` files — they're scaffolded with TODOs and frontmatter only
- Tailored \`research/config.yml\` topics — currently empty skeleton

Run the **Bootstrap prompt** ([prompts/bootstrap.md](https://github.com/intrepideai/docentic/blob/main/prompts/bootstrap.md)) and the **Config Seeder prompt** ([prompts/config-seeder.md](https://github.com/intrepideai/docentic/blob/main/prompts/config-seeder.md)) after this PR merges to fill those in.

Or use \`docentic populate\` to do it automatically with an API key in \`.env\`.

## Review checklist

- [ ] File tree looks right
- [ ] Stack detection matches reality (otherwise auto-detected docs may be wrong)
- [ ] No naming collisions with existing \`docs/\` directory or other repo conventions
- [ ] Ready to run the Bootstrap agent after merge

## After merge

1. Populate content (Bootstrap prompt or \`docentic populate\`)
2. Propose research topics (Config Seeder prompt)
3. Schedule daily maintenance per the [docentic README](https://github.com/intrepideai/docentic#readme)

---

Generated by [docentic](https://github.com/intrepideai/docentic).
`;
}
