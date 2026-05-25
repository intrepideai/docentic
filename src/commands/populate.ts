// `docent populate` — fill scaffolded TODOs using an LLM.
//
// Reads .env (or process.env) for an Anthropic API key, gathers context from
// the target repo, calls Claude with the bootstrap prompt + context, parses
// structured edits from a tool_use response, applies them, and optionally
// opens a PR.
//
// v0.1 supports Anthropic only. OpenAI / Gemini coming in v0.2.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callMessages, estimateTokens, estimateCostUsd, AnthropicError } from '../lib/anthropic.js';
import { gatherContext, formatContextForPrompt } from '../lib/repo-context.js';
import { log } from '../lib/log.js';
import {
  isGitRepo,
  hasUncommittedChanges,
  currentBranch,
  createBranch,
  addAll,
  commit,
  push,
  openPR,
  ghAvailable,
} from '../lib/git.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = resolve(__dirname, '..', '..', 'prompts');

const DEFAULT_MODEL = 'claude-sonnet-4-7';
const DEFAULT_MAX_TOKENS = 16000;
const DEFAULT_MAX_COST = 5.0;

// Files the scaffold leaves TODO markers in. We read their current state and
// ask Claude to return new versions. Generated files are NOT in this list —
// they're owned by gen-*.sh and we never overwrite them via populate.
const TODO_FILES = [
  'AGENTS.md',
  'docs/ARCHITECTURE.md',
  'docs/OPS.md',
  'docs/CONVENTIONS.md',
  'docs/GLOSSARY.md',
  'docs/SECURITY-NOTES.md',
  'docs/DECISIONS.md',
  'docs/HISTORY.md',
  // Auto-detected, only read if they exist
  'docs/UI.md',
  'docs/INFRA.md',
  'docs/ML.md',
  'docs/MOBILE.md',
];

export interface PopulateOptions {
  path?: string;
  model?: string;
  maxCostUsd?: number;
  noCommit?: boolean;
  noPr?: boolean;
  branch?: string;
  dryRun?: boolean;
  apiKey?: string;
}

// Load env vars from .env if present (no dep — tiny parser)
function loadDotenv(repoPath: string): void {
  const envPath = join(repoPath, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readBootstrapPrompt(): string {
  const p = join(PROMPTS_DIR, 'bootstrap.md');
  if (!existsSync(p)) {
    throw new Error(`Bootstrap prompt not found at ${p} — this is a packaging bug`);
  }
  return readFileSync(p, 'utf-8');
}

interface DocEdit {
  file: string;
  content: string;
  rationale?: string;
}

export async function populateCommand(opts: PopulateOptions): Promise<number> {
  const repoPath = resolve(opts.path ?? process.cwd());

  log.step('docent populate');
  log.dim(`  repo: ${repoPath}`);

  // 1. Preflight
  if (!isGitRepo(repoPath)) {
    log.error(`Not a git repo: ${repoPath}`);
    return 1;
  }
  if (!existsSync(join(repoPath, 'AGENTS.md'))) {
    log.error(`No AGENTS.md found — run \`docent init\` first`);
    return 1;
  }

  loadDotenv(repoPath);
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !opts.dryRun) {
    log.error(`No ANTHROPIC_API_KEY found in env or ${repoPath}/.env`);
    log.dim(`  Set it in .env (copy .env.example), or pass it inline:`);
    log.dim(`  ANTHROPIC_API_KEY=sk-ant-... docent populate`);
    log.dim(`  Or use --dry-run to inspect what would be sent without an API call.`);
    return 1;
  }

  if (!opts.dryRun && !opts.noCommit && hasUncommittedChanges(repoPath)) {
    log.error(`Working tree has uncommitted changes`);
    log.dim(`  commit or stash first, or use --no-commit to skip git ops`);
    return 1;
  }

  // 2. Gather context
  log.blank();
  log.step('Gathering repo context…');
  const ctx = gatherContext(repoPath);
  log.dim(`  manifest: ${ctx.manifestPath ?? '(none)'}`);
  log.dim(`  readme: ${ctx.readme ? 'yes' : 'no'}`);
  log.dim(`  root docs: ${ctx.rootDocs.length}`);
  log.dim(`  schemas: ${ctx.schemaFiles.length}`);
  log.dim(`  routes: ${ctx.routeFiles.length}`);
  log.dim(`  commits: ${ctx.recentCommits.split('\n').filter(Boolean).length}`);

  // 3. Read the TODO files
  const todoFileContents: Record<string, string> = {};
  for (const f of TODO_FILES) {
    const p = join(repoPath, f);
    if (existsSync(p)) {
      todoFileContents[f] = readFileSync(p, 'utf-8');
    }
  }
  log.dim(`  TODO files to populate: ${Object.keys(todoFileContents).length}`);

  // 4. Build prompt
  const bootstrap = readBootstrapPrompt();
  const contextBlock = formatContextForPrompt(ctx);
  const todoBlock = Object.entries(todoFileContents)
    .map(([f, content]) => `### ${f}\n\`\`\`markdown\n${content}\n\`\`\``)
    .join('\n\n');

  const systemPrompt = `You are docent's bootstrap agent. Your single job is to fill in the TODO markers in the files below by reading the repository context provided.

Follow the instructions in the docent bootstrap prompt:

${bootstrap}

Then call the apply_doc_edits tool ONCE with all file edits. Be concrete (real file paths, real function names, real env vars from the codebase). Be honest (if something is broken/missing, say so). Cross-reference (every file links to ARCHITECTURE.md as anchor).

CRITICAL:
- Replace every TODO marker — do NOT leave the literal string "TODO" in your output
- Keep all frontmatter blocks (---) exactly as scaffolded
- Keep all navigation headers (\`> **Anchor:** ...\`) exactly as scaffolded
- Keep "See also" footers
- Do NOT touch files marked owner:generator (they're not in the input)
- Return the COMPLETE new content of each file, not just a diff`;

  const userPrompt = `# Repository context

${contextBlock}

# Files to populate

The following files have TODO markers from the docent scaffold. Read the context above, then return new content for each.

${todoBlock}

# Your task

Call the apply_doc_edits tool ONCE with edits for every file above. Skip any file you can't meaningfully populate (just omit it from the edits array).`;

  const inputTokens = estimateTokens(systemPrompt + userPrompt);
  log.blank();
  log.dim(`  prompt: ~${inputTokens.toLocaleString()} tokens in`);
  const maxCost = opts.maxCostUsd ?? DEFAULT_MAX_COST;
  const estCost = estimateCostUsd(inputTokens, DEFAULT_MAX_TOKENS);
  log.dim(`  estimated max cost: $${estCost.toFixed(2)} (max allowed: $${maxCost.toFixed(2)})`);
  if (estCost > maxCost) {
    log.error(`Estimated cost exceeds max_cost_usd limit. Raise it with --max-cost or reduce repo context.`);
    return 1;
  }

  if (opts.dryRun) {
    log.blank();
    log.success(`Dry run — would call ${opts.model ?? DEFAULT_MODEL} with ~${inputTokens.toLocaleString()} input tokens`);
    log.dim(`  files that would be populated: ${Object.keys(todoFileContents).join(', ')}`);
    return 0;
  }

  // 5. Call the API
  log.blank();
  log.step(`Calling ${opts.model ?? DEFAULT_MODEL}…`);
  // apiKey is guaranteed defined here (dry-run path already returned above)
  if (!apiKey) return 1; // unreachable, but satisfies TS
  let response;
  try {
    response = await callMessages(
      {
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [
          {
            name: 'apply_doc_edits',
            description: 'Apply edits to the scaffolded doc files.',
            input_schema: {
              type: 'object',
              required: ['edits'],
              properties: {
                edits: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['file', 'content'],
                    properties: {
                      file: { type: 'string', description: 'Path relative to repo root' },
                      content: { type: 'string', description: 'COMPLETE new content of the file (not a diff)' },
                      rationale: { type: 'string', description: 'One sentence on what changed and why' },
                    },
                  },
                },
              },
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'apply_doc_edits' },
      },
      { apiKey },
    );
  } catch (err) {
    if (err instanceof AnthropicError) {
      log.error(`Anthropic API error: ${err.message}`);
    } else {
      log.error(`Unexpected error: ${(err as Error).message}`);
    }
    return 1;
  }

  const actualCost = estimateCostUsd(response.usage.input_tokens, response.usage.output_tokens);
  log.dim(`  used: ${response.usage.input_tokens.toLocaleString()} in / ${response.usage.output_tokens.toLocaleString()} out (~$${actualCost.toFixed(2)})`);

  // 6. Extract edits from tool_use
  const toolUse = response.content.find((b) => b.type === 'tool_use') as
    | { type: 'tool_use'; input: { edits?: DocEdit[] } }
    | undefined;
  if (!toolUse) {
    log.error(`Model did not call apply_doc_edits — stop_reason: ${response.stop_reason}`);
    return 1;
  }
  const edits = toolUse.input?.edits ?? [];
  if (edits.length === 0) {
    log.warn(`Model returned 0 edits — nothing to apply`);
    return 0;
  }

  // 7. Apply edits
  log.blank();
  log.step(`Applying ${edits.length} edit(s)…`);
  const applied: string[] = [];
  const skipped: { file: string; reason: string }[] = [];
  for (const edit of edits) {
    if (!TODO_FILES.includes(edit.file)) {
      skipped.push({ file: edit.file, reason: 'not in the TODO file allowlist' });
      continue;
    }
    const fullPath = join(repoPath, edit.file);
    if (!existsSync(fullPath)) {
      skipped.push({ file: edit.file, reason: 'file does not exist in repo' });
      continue;
    }
    writeFileSync(fullPath, edit.content, 'utf-8');
    applied.push(edit.file);
    log.success(`  ${edit.file}${edit.rationale ? ` — ${edit.rationale}` : ''}`);
  }
  if (skipped.length > 0) {
    log.warn(`Skipped ${skipped.length} edit(s):`);
    for (const s of skipped) log.dim(`    ${s.file}: ${s.reason}`);
  }

  // 8. Commit + PR (optional)
  if (opts.noCommit || applied.length === 0) {
    log.blank();
    log.success(`Done. ${applied.length} file(s) populated.`);
    if (opts.noCommit) log.dim(`  (--no-commit; review then commit manually)`);
    return 0;
  }

  const branchName = opts.branch ?? 'docent/populate-content';
  log.blank();
  log.step(`Committing on ${branchName}…`);
  try {
    if (currentBranch(repoPath) !== branchName) {
      createBranch(repoPath, branchName);
    }
    addAll(repoPath);
    commit(
      repoPath,
      `chore: populate docent scaffold with real content

Files populated by \`docent populate\`:
${applied.map((f) => `  - ${f}`).join('\n')}

Generated with ${opts.model ?? DEFAULT_MODEL}.
Approx cost: $${actualCost.toFixed(2)}

Co-Authored-By: docent populate <clyde@intrepide.ai>`,
    );
    log.success(`Committed on ${branchName}`);
  } catch (err) {
    log.error(`Commit failed: ${(err as Error).message}`);
    return 1;
  }

  if (opts.noPr) {
    log.blank();
    log.success(`Done. Branch ${branchName} ready to push.`);
    return 0;
  }

  if (!ghAvailable()) {
    log.warn(`gh CLI not found — skipping PR creation`);
    return 0;
  }

  log.blank();
  log.step('Opening PR…');
  try {
    push(repoPath, branchName);
    const url = openPR(repoPath, {
      title: 'chore: populate docent scaffold with real content',
      body: `Populated by \`docent populate\` using ${opts.model ?? DEFAULT_MODEL}.

## Files populated
${applied.map((f) => `- \`${f}\``).join('\n')}

## Skipped
${skipped.length > 0 ? skipped.map((s) => `- \`${s.file}\` — ${s.reason}`).join('\n') : '_(none)_'}

## Cost
~$${actualCost.toFixed(2)} (${response.usage.input_tokens.toLocaleString()} input + ${response.usage.output_tokens.toLocaleString()} output tokens)

## Review checklist
- [ ] Content is accurate (no hallucinated paths / functions / env vars)
- [ ] No TODO markers remain
- [ ] Frontmatter blocks unchanged
- [ ] Navigation headers unchanged
- [ ] Generated files (\`docs/STACK.md\`, \`DATA.md\`, \`API.md\`, \`MAP.md\`, \`INTEGRATIONS.md\`) NOT touched
`,
      label: 'docent',
    });
    log.success(`PR opened: ${url}`);
  } catch (err) {
    log.error(`PR creation failed: ${(err as Error).message}`);
    log.dim(`  branch is committed; open the PR manually with gh pr create`);
  }

  return 0;
}
