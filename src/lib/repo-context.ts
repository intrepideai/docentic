// Gather context about the target repo to pass to the LLM during `docentic populate`.
//
// Includes: top-level dir tree, package manifest, recent git log, schema files,
// route handler tree, existing README and root-level docs. Capped to keep the
// prompt within sane token bounds.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface RepoContext {
  treeTop: string;            // 2-level tree of repo
  manifest: string | null;    // package.json / pyproject.toml / etc
  manifestPath: string | null;
  readme: string | null;      // README.md if present (truncated)
  rootDocs: Array<{ path: string; content: string }>; // CONTRIBUTING, DEVELOPERS, SETUP, etc.
  recentCommits: string;      // git log --oneline -30
  schemaFiles: Array<{ path: string; content: string }>;
  routeFiles: string[];       // paths to API route handlers (just names, not content)
}

const TRUNCATE_FILE_CHARS = 8000;
const TRUNCATE_TREE_LINES = 200;

function safeRun(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function tryRead(path: string): string | null {
  try {
    const content = readFileSync(path, 'utf-8');
    return content.length > TRUNCATE_FILE_CHARS
      ? content.slice(0, TRUNCATE_FILE_CHARS) + `\n…[truncated; original was ${content.length} chars]`
      : content;
  } catch {
    return null;
  }
}

function exists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function buildTree(root: string, depth = 2): string {
  const lines: string[] = [];
  function walk(dir: string, prefix: string, level: number): void {
    if (level > depth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      if (['node_modules', 'dist', '.next', '.turbo', '__pycache__', 'target', 'build'].includes(name)) continue;
      const full = join(dir, name);
      let isDir = false;
      try { isDir = statSync(full).isDirectory(); } catch { continue; }
      lines.push(`${prefix}${name}${isDir ? '/' : ''}`);
      if (lines.length > TRUNCATE_TREE_LINES) return;
      if (isDir) walk(full, prefix + '  ', level + 1);
    }
  }
  walk(root, '', 0);
  if (lines.length > TRUNCATE_TREE_LINES) {
    lines.push(`…[truncated at ${TRUNCATE_TREE_LINES} entries]`);
  }
  return lines.join('\n');
}

function findManifest(root: string): { path: string; content: string } | null {
  const candidates = ['package.json', 'pyproject.toml', 'setup.py', 'requirements.txt', 'go.mod', 'Cargo.toml', 'Gemfile', 'pom.xml', 'build.gradle'];
  let primary: { path: string; content: string } | null = null;
  for (const c of candidates) {
    const p = join(root, c);
    if (exists(p)) {
      const content = tryRead(p);
      if (content) { primary = { path: c, content }; break; }
    }
  }
  if (!primary) return null;

  // In a monorepo the root manifest usually lacks the app's real dependencies
  // (they live in apps/*/package.json). Append those so `populate`'s LLM sees
  // the actual stack instead of an empty root workspace manifest.
  const extra: string[] = [];
  for (const parent of ['apps', 'packages']) {
    let names: string[];
    try { names = readdirSync(join(root, parent)).sort(); } catch { continue; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const rel = `${parent}/${name}/package.json`;
      const content = exists(join(root, rel)) ? tryRead(join(root, rel)) : null;
      if (content) extra.push(`\n\n# ${rel}\n${content}`);
      if (extra.length >= 6) break;
    }
    if (extra.length >= 6) break;
  }
  return { path: primary.path, content: primary.content + extra.join('') };
}

// Expand a pattern containing a single `*` directory segment (e.g.
// `apps/*/prisma/schema.prisma`) into the concrete paths that exist one level
// under the starred dir. Returns relative paths.
function expandStar(root: string, pattern: string): string[] {
  const star = pattern.indexOf('*');
  if (star === -1) return [pattern];
  const before = pattern.slice(0, star).replace(/\/$/, ''); // "apps"
  const after = pattern.slice(star + 1).replace(/^\//, ''); // "prisma/schema.prisma"
  let names: string[];
  try {
    names = readdirSync(join(root, before));
  } catch {
    return [];
  }
  return names
    .filter((n) => !n.startsWith('.'))
    .map((n) => [before, n, after].filter(Boolean).join('/'));
}

function findSchemas(root: string): Array<{ path: string; content: string }> {
  const patterns = [
    // Prisma (root + monorepo apps/packages) — the `*` ones were previously
    // skipped entirely, so nested schemas never reached the LLM.
    'prisma/schema.prisma',
    'apps/*/prisma/schema.prisma',
    'packages/*/prisma/schema.prisma',
    // Drizzle default layouts
    'src/db/schema.ts', 'db/schema.ts', 'shared/schema.ts', 'server/schema.ts',
    // Other ecosystems
    'db/schema.rb', 'alembic.ini',
    'openapi.yaml', 'openapi.yml', 'openapi.json',
    'swagger.yaml', 'swagger.yml', 'swagger.json',
  ];
  const out: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  for (const pat of patterns) {
    const rels = pat.includes('*') ? expandStar(root, pat) : [pat];
    for (const rel of rels) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      const p = join(root, rel);
      if (exists(p)) {
        const content = tryRead(p);
        if (content) out.push({ path: rel, content });
      }
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function findRootDocs(root: string): Array<{ path: string; content: string }> {
  const candidates = ['CONTRIBUTING.md', 'DEVELOPERS.md', 'SETUP.md', 'QUICKSTART.md', 'START-HERE.md', 'ARCHITECTURE.md', 'INSTALL.md'];
  const out: Array<{ path: string; content: string }> = [];
  for (const c of candidates) {
    const p = join(root, c);
    if (exists(p)) {
      const content = tryRead(p);
      if (content) out.push({ path: c, content });
    }
  }
  return out;
}

function findRouteFiles(root: string): string[] {
  // Light heuristic: walk app/ or src/ looking for route handlers
  const out: string[] = [];
  for (const base of ['apps', 'app', 'src', 'pages']) {
    const dir = join(root, base);
    if (!existsSync(dir)) continue;
    walkRoutes(dir, root, out);
    if (out.length > 100) break;
  }
  return out.slice(0, 100);
}

function walkRoutes(dir: string, root: string, out: string[]): void {
  if (out.length > 100) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = join(dir, name);
    let isDir = false;
    try { isDir = statSync(full).isDirectory(); } catch { continue; }
    if (isDir) {
      walkRoutes(full, root, out);
    } else if (/^route\.(ts|js|tsx|jsx)$|^index\.(ts|js|tsx|jsx)$|^handler\.(ts|js)$/.test(name)) {
      out.push(relative(root, full));
    }
  }
}

export function gatherContext(repoPath: string): RepoContext {
  const treeTop = buildTree(repoPath, 2);
  const manifest = findManifest(repoPath);
  const readmePath = join(repoPath, 'README.md');
  const readme = exists(readmePath) ? tryRead(readmePath) : null;
  const rootDocs = findRootDocs(repoPath);
  const recentCommits = safeRun('git log --since=90.days.ago --no-merges --pretty=format:"%h %ad %s" --date=short -50', repoPath);
  const schemaFiles = findSchemas(repoPath);
  const routeFiles = findRouteFiles(repoPath);

  return {
    treeTop,
    manifest: manifest?.content ?? null,
    manifestPath: manifest?.path ?? null,
    readme,
    rootDocs,
    recentCommits,
    schemaFiles,
    routeFiles,
  };
}

export function formatContextForPrompt(ctx: RepoContext): string {
  const parts: string[] = [];

  parts.push('## Repository tree (top 2 levels)\n```\n' + ctx.treeTop + '\n```');

  if (ctx.manifest) {
    parts.push(`## Package manifest (\`${ctx.manifestPath}\`)\n\`\`\`\n${ctx.manifest}\n\`\`\``);
  }

  if (ctx.readme) {
    parts.push('## README.md\n```markdown\n' + ctx.readme + '\n```');
  }

  for (const doc of ctx.rootDocs) {
    parts.push(`## ${doc.path}\n\`\`\`markdown\n${doc.content}\n\`\`\``);
  }

  for (const s of ctx.schemaFiles) {
    parts.push(`## ${s.path}\n\`\`\`\n${s.content}\n\`\`\``);
  }

  if (ctx.routeFiles.length > 0) {
    parts.push('## Route / handler files (paths only)\n```\n' + ctx.routeFiles.join('\n') + '\n```');
  }

  if (ctx.recentCommits) {
    parts.push('## Recent git history (last 90 days)\n```\n' + ctx.recentCommits + '\n```');
  }

  return parts.join('\n\n');
}
