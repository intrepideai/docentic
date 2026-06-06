#!/usr/bin/env node
// docentic — your agent guide through any codebase

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { checkCommand } from './commands/check.js';
import { installCommand } from './commands/install.js';
import { populateCommand } from './commands/populate.js';

const program = new Command();

program
  .name('docentic')
  .description('Your agent guide through any codebase. Scaffolds AI-friendly docs into any repo.')
  .version('0.2.2');

program
  .command('init')
  .description('Scaffold the docentic template into a repo')
  .argument('[path]', 'target repo path (defaults to cwd)')
  .option('-n, --dry-run', 'show what would be created without writing')
  .option('-f, --force', 'overwrite existing files')
  .option('-m, --minimal', 'only infrastructure (no docs/* skeletons)')
  .option('--spine-only', 'scaffold AGENTS.md + docs/ only (skip research/ and scripts/llm-docs/)')
  .option('--force-ignored', 'scaffold files even when they would be ignored by .gitignore')
  .option('--no-pr', 'commit on a branch but do not open a PR')
  .option('--no-commit', 'scaffold files without git operations')
  .option('-b, --branch <name>', 'branch name (default: docentic/template-scaffold)')
  .action(async (path: string | undefined, opts) => {
    const code = await initCommand({
      path,
      dryRun: opts.dryRun,
      force: opts.force,
      minimal: opts.minimal,
      spineOnly: opts.spineOnly,
      forceIgnored: opts.forceIgnored,
      noPr: !opts.pr, // commander inverts --no-pr
      noCommit: !opts.commit,
      branch: opts.branch,
    });
    process.exit(code);
  });

program
  .command('check')
  .description('Validate a docentic-scaffolded repo (no writes). Exit non-zero on errors. Use in CI.')
  .argument('[path]', 'target repo path (defaults to cwd)')
  .option('--json', 'output JSON instead of human-readable text (for tooling)')
  .option('--warnings-as-errors', 'fail on warnings too — strict CI mode')
  .action(async (path: string | undefined, opts) => {
    const code = await checkCommand({
      path,
      json: opts.json,
      warningsAsErrors: opts.warningsAsErrors,
    });
    process.exit(code);
  });

program
  .command('populate')
  .description('Fill scaffolded TODOs by reading the codebase. Requires ANTHROPIC_API_KEY in .env or env.')
  .argument('[path]', 'target repo path (defaults to cwd)')
  .option('-m, --model <name>', 'Claude model to use (default: claude-sonnet-4-6)')
  .option('--max-cost <usd>', 'abort if estimated cost exceeds this USD amount (default: 5)', parseFloat)
  .option('--no-pr', 'commit on a branch but do not open a PR')
  .option('--no-commit', 'apply edits without git operations')
  .option('-b, --branch <name>', 'branch name (default: docentic/populate-content)')
  .option('-n, --dry-run', 'gather context and estimate cost without calling the API')
  .action(async (path: string | undefined, opts) => {
    const code = await populateCommand({
      path,
      model: opts.model,
      maxCostUsd: opts.maxCost,
      noPr: !opts.pr,
      noCommit: !opts.commit,
      branch: opts.branch,
      dryRun: opts.dryRun,
    });
    process.exit(code);
  });

program
  .command('install')
  .description('Install the docentic skill into Claude Code and/or Cursor.')
  .option('--claude', 'install the Claude Code skill (~/.claude/skills/docentic/)')
  .option('--cursor', 'install the Cursor rule (default: global ~/.cursor/rules/)')
  .option('--project <path>', 'for Cursor: install per-project (<path>/.cursor/rules/) instead of globally')
  .option('-f, --force', 'overwrite if already installed')
  .option('-n, --dry-run', 'show what would be installed without writing')
  .action(async (opts) => {
    const code = await installCommand({
      claude: opts.claude,
      cursor: opts.cursor,
      project: opts.project,
      force: opts.force,
      dryRun: opts.dryRun,
    });
    process.exit(code);
  });

program.parseAsync().catch((err) => {
  console.error('Fatal:', err.message ?? err);
  process.exit(1);
});
