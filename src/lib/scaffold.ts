// Scaffold logic — copy template files into target repo with placeholder substitution.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetectedStack } from './detect-stack.js';
import { autoDetectedDocs } from './detect-stack.js';
import { filterIgnored } from './git.js';
import { packageVersion } from './version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// templates/ lives at the package root, alongside dist/ (or src/ in dev)
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

export interface ScaffoldOptions {
  repoPath: string;
  repoName: string;
  stack: DetectedStack;
  minimal?: boolean;     // skip docs/* skeletons (keep infra + AGENTS.md)
  spineOnly?: boolean;   // skip research/ and scripts/llm-docs/ (keep AGENTS.md + docs/)
  full?: boolean;        // opt IN to the research/ pipeline (off by default)
  force?: boolean;
  forceIgnored?: boolean; // scaffold files even if they're in .gitignore
  dryRun?: boolean;
}

export interface ScaffoldResult {
  filesCreated: string[];
  filesSkipped: { path: string; reason: string }[];
  filesGitignored: string[];  // files we would have written but are .gitignored
  dirsCreated: string[];
}

// Files that always come from the template, regardless of --minimal mode.
const ALWAYS_FILES = [
  // Claude Code doesn't read AGENTS.md natively yet (anthropics/claude-code#1846),
  // so ship a tiny CLAUDE.md that imports it. Skipped if one already exists.
  'CLAUDE.md',
  'scripts/llm-docs/MAINTAIN.md',
  'scripts/llm-docs/detect-stack.sh',
  'scripts/llm-docs/lang/python.sh',
  'scripts/llm-docs/lang/go.sh',
  'scripts/llm-docs/lang/ruby.sh',
  'scripts/llm-docs/lang/php.sh',
  'scripts/llm-docs/gen-stack.sh',
  'scripts/llm-docs/gen-data.sh',
  'scripts/llm-docs/gen-api.sh',
  'scripts/llm-docs/gen-map.sh',
  'scripts/llm-docs/gen-integrations.sh',
  'scripts/llm-docs/validate.sh',
  'scripts/llm-docs/research.sh',
  'scripts/llm-docs/prompts/researcher.md',
  'scripts/llm-docs/prompts/librarian.md',
  'scripts/llm-docs/prompts/history.md',
  'scripts/llm-docs/prompts/scouts/_template.md',
  'scripts/llm-docs/prompts/scouts/x.md',
  'scripts/llm-docs/prompts/scouts/github.md',
  'scripts/llm-docs/prompts/scouts/arxiv.md',
  'scripts/llm-docs/prompts/scouts/web.md',
  'scripts/llm-docs/prompts/scouts/hf.md',
  'scripts/llm-docs/prompts/scouts/reddit.md',
  'scripts/llm-docs/prompts/scouts/hn.md',
  'scripts/llm-docs/prompts/scouts/rss.md',
  'scripts/llm-docs/prompts/scouts/lobsters.md',
  'scripts/llm-docs/prompts/scouts/youtube.md',
  '.claude/skills/maintain-repo/SKILL.md',
  '.agents/REMOVALS.md',
  'research/README.md',
  'research/intake/QUEUE.md',
  'research/intake/DISCOVERY_LOG.md',
  'research/_meta/DIGEST.md',
  'research/_meta/TOP-IDEAS.md',
  'research/_meta/BY-TOPIC.md',
  'research/_meta/ACTIONABLE.md',
  'research/_meta/EVERGREEN.md',
  'research/_meta/COVERAGE.md',
  'research/_meta/SUGGESTIONS.md',
  'research/topics/README.md',
  'research/ideas/README.md',
  'research/archive/README.md',
];

// Template files with .template suffix that need placeholder substitution.
// Map of templateRelPath → targetRelPath (without .template).
const TEMPLATED_FILES: Record<string, string> = {
  'AGENTS.md.template': 'AGENTS.md',
  'docs/ARCHITECTURE.md.template': 'docs/ARCHITECTURE.md',
  'docs/STACK.md.template': 'docs/STACK.md',
  'docs/DATA.md.template': 'docs/DATA.md',
  'docs/API.md.template': 'docs/API.md',
  'docs/MAP.md.template': 'docs/MAP.md',
  'docs/INTEGRATIONS.md.template': 'docs/INTEGRATIONS.md',
  'docs/OPS.md.template': 'docs/OPS.md',
  'docs/CONVENTIONS.md.template': 'docs/CONVENTIONS.md',
  'docs/GLOSSARY.md.template': 'docs/GLOSSARY.md',
  'docs/SECURITY-NOTES.md.template': 'docs/SECURITY-NOTES.md',
  'docs/DECISIONS.md.template': 'docs/DECISIONS.md',
  'docs/HISTORY.md.template': 'docs/HISTORY.md',
  'research/config.yml.template': 'research/config.yml',
  'research/index.json.template': 'research/index.json',
  '.agents/index.json.template': '.agents/index.json',
};

// Auto-detected templated files. Only copied when the stack matches.
const AUTO_DETECTED_TEMPLATES: Record<keyof Pick<DetectedStack, 'hasFrontend' | 'hasInfra' | 'hasML' | 'hasMobile'>, { tmpl: string; target: string }> = {
  hasFrontend: { tmpl: 'docs/UI.md.template', target: 'docs/UI.md' },
  hasInfra: { tmpl: 'docs/INFRA.md.template', target: 'docs/INFRA.md' },
  hasML: { tmpl: 'docs/ML.md.template', target: 'docs/ML.md' },
  hasMobile: { tmpl: 'docs/MOBILE.md.template', target: 'docs/MOBILE.md' },
};

// Files that should be skipped in --minimal mode (only docs/ + AGENTS.md).
const MINIMAL_SKIP_PATTERNS = [
  /^research\//,
  /^docs\/(API|DATA|STACK|MAP|INTEGRATIONS|SECURITY-NOTES|DECISIONS|HISTORY|GLOSSARY|CONVENTIONS|OPS)\.md$/,
];

// Files that should be skipped in --spine-only mode (keep AGENTS.md + docs/ +
// .agents/ inventory, skip the research/ pipeline and scripts/llm-docs/ tooling).
// Use case: a repo that just wants the agent-friendly doc spine and doesn't
// want to run the research / daily maintenance loop yet.
const SPINE_ONLY_SKIP_PATTERNS = [
  /^research\//,
  /^scripts\/llm-docs\//,
  /^\.claude\//,
];

// The research/ pipeline — the daily scout/research loop and its prompts. This
// is the bulk of the "scaffold sprawl" (the research/ tree + the per-source
// scout prompts) and most repos don't run the loop on day one, so it's OFF by
// default and opt-in via --full. The generators, validators, and MAINTAIN.md
// stay in the default scaffold — they're the deterministic value, not sprawl.
const RESEARCH_PIPELINE_PATTERNS = [
  /^research\//,
  /^scripts\/llm-docs\/research\.sh$/,
  /^scripts\/llm-docs\/prompts\/researcher\.md$/,
  /^scripts\/llm-docs\/prompts\/librarian\.md$/,
  /^scripts\/llm-docs\/prompts\/history\.md$/,
  /^scripts\/llm-docs\/prompts\/scouts\//,
];

// Single source of truth for "is this target dropped in the current mode?".
// Used both when planning the file copy AND when building the index docs[]
// array, so .agents/index.json never lists a file the mode didn't scaffold.
function shouldSkipForMode(
  targetRelPath: string,
  opts: { minimal?: boolean; spineOnly?: boolean; full?: boolean },
): boolean {
  if (opts.minimal && MINIMAL_SKIP_PATTERNS.some((re) => re.test(targetRelPath))) return true;
  if (opts.spineOnly && SPINE_ONLY_SKIP_PATTERNS.some((re) => re.test(targetRelPath))) return true;
  // Research pipeline is opt-in everywhere: skip it unless --full was passed.
  if (!opts.full && RESEARCH_PIPELINE_PATTERNS.some((re) => re.test(targetRelPath))) return true;
  return false;
}

function substitute(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function buildDocsArrayForIndex(
  stack: DetectedStack,
  opts: { minimal?: boolean; spineOnly?: boolean; full?: boolean },
): string {
  const docs: Array<Record<string, unknown>> = [
    { path: 'AGENTS.md', owner: 'human', edit_authority: ['human', 'ai'], merge_policy: 'review', critical: true, size_limit_lines: 200, hash: 'pending' },
    { path: 'docs/ARCHITECTURE.md', owner: 'human', edit_authority: ['human', 'ai'], merge_policy: 'review', critical: true, anchor: true, size_limit_lines: 500, hash: 'pending' },
    { path: 'docs/STACK.md', owner: 'generator', edit_authority: ['generator', 'human'], merge_policy: 'auto', source: 'scripts/llm-docs/gen-stack.sh', hash: 'pending', generated_hash: 'pending' },
    { path: 'docs/DATA.md', owner: 'generator', edit_authority: ['generator', 'human'], merge_policy: 'auto', source: 'scripts/llm-docs/gen-data.sh', hash: 'pending', generated_hash: 'pending' },
    { path: 'docs/API.md', owner: 'generator', edit_authority: ['generator', 'human'], merge_policy: 'auto', source: 'scripts/llm-docs/gen-api.sh', hash: 'pending', generated_hash: 'pending' },
    { path: 'docs/MAP.md', owner: 'generator', edit_authority: ['generator', 'human'], merge_policy: 'auto', source: 'scripts/llm-docs/gen-map.sh', hash: 'pending', generated_hash: 'pending' },
    { path: 'docs/OPS.md', owner: 'human', edit_authority: ['human', 'ai'], merge_policy: 'review', critical: true, hash: 'pending' },
    { path: 'docs/CONVENTIONS.md', owner: 'human', edit_authority: ['human', 'ai'], merge_policy: 'auto_delayed:24h', hash: 'pending' },
    { path: 'docs/GLOSSARY.md', owner: 'human', edit_authority: ['human', 'ai'], merge_policy: 'auto_delayed:24h', hash: 'pending' },
    { path: 'docs/INTEGRATIONS.md', owner: 'generator', edit_authority: ['generator', 'human'], merge_policy: 'auto', source: 'scripts/llm-docs/gen-integrations.sh', hash: 'pending', generated_hash: 'pending' },
    { path: 'docs/SECURITY-NOTES.md', owner: 'human', edit_authority: ['human', 'ai'], merge_policy: 'review', critical: true, hash: 'pending' },
    { path: 'docs/DECISIONS.md', owner: 'human', edit_authority: ['human', 'ai'], merge_policy: 'review', critical: true, hash: 'pending' },
    { path: 'docs/HISTORY.md', owner: 'ai', edit_authority: ['ai', 'human'], merge_policy: 'auto_delayed:4h', hash: 'pending' },
  ];
  // Auto-detected docs
  for (const f of autoDetectedDocs(stack)) {
    docs.push({
      path: `docs/${f}`,
      owner: 'human',
      edit_authority: ['human', 'ai'],
      merge_policy: 'auto_delayed:24h',
      auto_detected: true,
      hash: 'pending',
    });
  }
  // Only list docs the current mode actually scaffolds, so `docentic check`
  // (which treats index.json docs[] as the required set) passes for --minimal
  // and --spine-only instead of demanding files that were intentionally skipped.
  const included = docs.filter((d) => !shouldSkipForMode(String(d.path), opts));
  return JSON.stringify(included, null, 2);
}

function ensureDir(path: string, dryRun: boolean, dirsCreated: string[]) {
  if (existsSync(path)) return;
  if (!dryRun) mkdirSync(path, { recursive: true });
  dirsCreated.push(path);
}

function copyOne(
  templateRelPath: string,
  targetRelPath: string,
  opts: ScaffoldOptions,
  vars: Record<string, string>,
  result: ScaffoldResult,
): void {
  const sourcePath = join(TEMPLATES_DIR, templateRelPath);
  const destPath = join(opts.repoPath, targetRelPath);

  if (!existsSync(sourcePath)) {
    result.filesSkipped.push({ path: targetRelPath, reason: `template missing: ${templateRelPath}` });
    return;
  }
  if (existsSync(destPath) && !opts.force) {
    result.filesSkipped.push({ path: targetRelPath, reason: 'already exists (use --force to overwrite)' });
    return;
  }

  if (opts.dryRun) {
    result.filesCreated.push(targetRelPath);
    return;
  }

  ensureDir(dirname(destPath), opts.dryRun ?? false, result.dirsCreated);

  if (templateRelPath.endsWith('.template')) {
    // Substitute placeholders
    const raw = readFileSync(sourcePath, 'utf-8');
    const out = substitute(raw, vars);
    writeFileSync(destPath, out, 'utf-8');
  } else {
    copyFileSync(sourcePath, destPath);
    // Preserve executable bit for shell scripts
    if (targetRelPath.endsWith('.sh')) {
      chmodSync(destPath, 0o755);
    }
  }
  result.filesCreated.push(targetRelPath);
}

export function scaffold(opts: ScaffoldOptions): ScaffoldResult {
  const result: ScaffoldResult = {
    filesCreated: [],
    filesSkipped: [],
    filesGitignored: [],
    dirsCreated: [],
  };

  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0] ?? timestamp.slice(0, 10);
  const stackArr = JSON.stringify(stackLabels(opts.stack));
  const docsArr = buildDocsArrayForIndex(opts.stack, opts);
  // The research library row only points somewhere real when the research/
  // pipeline was scaffolded (--full). In the lean default we omit the row so
  // AGENTS.md never carries a dead pointer.
  const researchRow = opts.full
    ? '| Research library | [research/_meta/TOP-IDEAS.md](./research/_meta/TOP-IDEAS.md) |'
    : '';
  const vars: Record<string, string> = {
    REPO_NAME: opts.repoName,
    TIMESTAMP: timestamp,
    DATE: date,
    STACK_ARRAY: stackArr,
    DOCS_ARRAY: docsArr,
    TEMPLATE_VERSION: packageVersion(),
    RESEARCH_ROW: researchRow,
  };

  // Build the full list of (template, target) pairs we plan to write so we
  // can pre-check against .gitignore. Any file the repo ignores would be
  // silently swallowed on commit — surface it loudly before scaffolding.
  const planned: Array<{ tmpl: string; target: string }> = [];
  for (const f of ALWAYS_FILES) {
    if (shouldSkipForMode(f, opts)) continue;
    planned.push({ tmpl: f, target: f });
  }
  for (const [tmpl, target] of Object.entries(TEMPLATED_FILES)) {
    if (shouldSkipForMode(target, opts)) continue;
    planned.push({ tmpl, target });
  }
  for (const [stackKey, file] of Object.entries(AUTO_DETECTED_TEMPLATES) as Array<[keyof DetectedStack, { tmpl: string; target: string }]>) {
    if (!opts.stack[stackKey]) continue;
    if (shouldSkipForMode(file.target, opts)) continue;
    planned.push({ tmpl: file.tmpl, target: file.target });
  }

  // Run gitignore check. Result is the subset of planned targets that the
  // repo's .gitignore would drop on `git add`.
  const ignored = new Set(filterIgnored(opts.repoPath, planned.map((p) => p.target)));
  result.filesGitignored = Array.from(ignored).sort();

  // Pre-flight hard-stop: if ANY planned file is gitignored and the user hasn't
  // opted into --force-ignored, write NOTHING. Previously we wrote the
  // non-ignored files and then reported "these were NOT written" — leaving a
  // broken half-scaffold on disk. A real pre-flight means the repo is untouched
  // until .gitignore is fixed (or --force-ignored is passed). Dry-run still
  // proceeds so the caller can show the full would-create list + the warning.
  if (!opts.dryRun && result.filesGitignored.length > 0 && !opts.forceIgnored) {
    return result;
  }

  for (const { tmpl, target } of planned) {
    if (ignored.has(target) && !opts.forceIgnored) {
      result.filesSkipped.push({ path: target, reason: 'gitignored (use --force-ignored to write anyway)' });
      continue;
    }
    copyOne(tmpl, target, opts, vars, result);
  }

  return result;
}

function stackLabels(stack: DetectedStack): string[] {
  const labels = new Set<string>([...stack.languages, ...stack.labels]);
  if (stack.framework) labels.add(stack.framework);
  if (stack.packageManager) labels.add(stack.packageManager);
  return Array.from(labels);
}
