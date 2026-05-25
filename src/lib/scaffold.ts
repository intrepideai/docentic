// Scaffold logic — copy template files into target repo with placeholder substitution.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetectedStack } from './detect-stack.js';
import { autoDetectedDocs } from './detect-stack.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// templates/ lives at the package root, alongside dist/ (or src/ in dev)
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

export interface ScaffoldOptions {
  repoPath: string;
  repoName: string;
  stack: DetectedStack;
  minimal?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export interface ScaffoldResult {
  filesCreated: string[];
  filesSkipped: { path: string; reason: string }[];
  dirsCreated: string[];
}

// Files that always come from the template, regardless of --minimal mode.
const ALWAYS_FILES = [
  'scripts/llm-docs/MAINTAIN.md',
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

function substitute(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function buildDocsArrayForIndex(stack: DetectedStack): string {
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
  return JSON.stringify(docs, null, 2);
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
    dirsCreated: [],
  };

  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0] ?? timestamp.slice(0, 10);
  const stackArr = JSON.stringify(stackLabels(opts.stack));
  const docsArr = buildDocsArrayForIndex(opts.stack);
  const vars: Record<string, string> = {
    REPO_NAME: opts.repoName,
    TIMESTAMP: timestamp,
    DATE: date,
    STACK_ARRAY: stackArr,
    DOCS_ARRAY: docsArr,
  };

  // Copy always-files
  for (const f of ALWAYS_FILES) {
    if (opts.minimal && MINIMAL_SKIP_PATTERNS.some((re) => re.test(f))) continue;
    copyOne(f, f, opts, vars, result);
  }

  // Copy templated files (with placeholder substitution)
  for (const [tmpl, target] of Object.entries(TEMPLATED_FILES)) {
    if (opts.minimal && MINIMAL_SKIP_PATTERNS.some((re) => re.test(target))) continue;
    copyOne(tmpl, target, opts, vars, result);
  }

  // Auto-detected docs based on stack
  for (const [stackKey, file] of Object.entries(AUTO_DETECTED_TEMPLATES) as Array<[keyof DetectedStack, { tmpl: string; target: string }]>) {
    if (opts.stack[stackKey]) {
      if (opts.minimal && MINIMAL_SKIP_PATTERNS.some((re) => re.test(file.target))) continue;
      copyOne(file.tmpl, file.target, opts, vars, result);
    }
  }

  return result;
}

function stackLabels(stack: DetectedStack): string[] {
  const labels = new Set<string>([...stack.languages, ...stack.labels]);
  if (stack.framework) labels.add(stack.framework);
  if (stack.packageManager) labels.add(stack.packageManager);
  return Array.from(labels);
}
