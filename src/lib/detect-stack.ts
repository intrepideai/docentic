// Stack detection — decides which auto-detected docs files to scaffold
// and labels for .agents/index.json.
//
// Walks the repo root + 1-deep into common monorepo locations (apps/,
// packages/, backend/, frontend*/, mobile*/, infrastructure/) so that
// non-Node stacks (Laravel, Flutter, Rails, etc.) and polyglot repos
// don't get missed when there's only a Node-ish package.json at root.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface DetectedStack {
  languages: string[];
  framework: string | null;
  database: string | null;
  hasFrontend: boolean;
  hasInfra: boolean;
  hasML: boolean;
  hasMobile: boolean;
  packageManager: string | null;
  labels: string[]; // Used in .agents/index.json `stack` field
  detectedIn: string[]; // Subdirs we actually inspected — surfaces what we found
}

const fileExists = (root: string, ...paths: string[]) =>
  paths.some((p) => existsSync(join(root, p)));

const tryRead = (root: string, path: string): string => {
  try {
    return readFileSync(join(root, path), 'utf-8');
  } catch {
    return '';
  }
};

// Candidate subdirs to also inspect — common monorepo / polyglot layouts.
// Anything in apps/*, packages/*, plus a few well-known top-level conventions.
function candidateSubdirs(repoPath: string): string[] {
  const dirs: string[] = ['.'];
  const directHits = ['backend', 'frontend', 'mobile', 'infrastructure', 'api', 'server', 'web', 'client', 'app'];
  for (const d of directHits) {
    const p = join(repoPath, d);
    try {
      if (statSync(p).isDirectory()) dirs.push(d);
    } catch {}
  }
  // Anything matching frontend-v2, mobile-new, backend-api, etc.
  try {
    for (const name of readdirSync(repoPath)) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      if (/^(backend|frontend|mobile|web|app|api|server|client)[-_].+/.test(name)) {
        const p = join(repoPath, name);
        try {
          if (statSync(p).isDirectory() && !dirs.includes(name)) dirs.push(name);
        } catch {}
      }
    }
  } catch {}
  // apps/* and packages/* (Turborepo / pnpm workspaces / Nx style)
  for (const parent of ['apps', 'packages']) {
    const parentPath = join(repoPath, parent);
    if (!existsSync(parentPath)) continue;
    try {
      for (const name of readdirSync(parentPath)) {
        if (name.startsWith('.')) continue;
        const p = join(parentPath, name);
        try {
          if (statSync(p).isDirectory()) dirs.push(join(parent, name));
        } catch {}
      }
    } catch {}
  }
  return dirs;
}

function detectInDir(repoPath: string, subdir: string, result: DetectedStack): void {
  const dirAbs = subdir === '.' ? repoPath : join(repoPath, subdir);
  if (!existsSync(dirAbs)) return;

  let touched = false;
  const has = (...names: string[]) => names.some((n) => existsSync(join(dirAbs, n)));
  // existsSync doesn't expand globs, so match by suffix against real dir entries
  // (e.g. *.xcodeproj). Returns false if the dir can't be read.
  const hasEntryMatching = (re: RegExp): boolean => {
    try { return readdirSync(dirAbs).some((f) => re.test(f)); } catch { return false; }
  };
  const read = (name: string): string => {
    try { return readFileSync(join(dirAbs, name), 'utf-8'); } catch { return ''; }
  };

  // --- Languages ---
  if (has('package.json')) {
    if (!result.languages.includes('javascript/typescript')) result.languages.push('javascript/typescript');
    touched = true;
  }
  if (has('tsconfig.json') && !result.labels.includes('typescript')) {
    result.labels.push('typescript');
  }
  if (has('pyproject.toml', 'setup.py', 'requirements.txt')) {
    if (!result.languages.includes('python')) result.languages.push('python');
    touched = true;
  }
  if (has('go.mod')) {
    if (!result.languages.includes('go')) result.languages.push('go');
    touched = true;
    // Go web framework + DB driver/ORM from go.mod's require graph. (go.sum only
    // adds per-module hashes — every package we match is already in go.mod.)
    const gomod = read('go.mod');
    if (!result.framework) {
      if (/gin-gonic\/gin/.test(gomod)) result.framework = 'gin';
      else if (/labstack\/echo/.test(gomod)) result.framework = 'echo';
      else if (/go-chi\/chi/.test(gomod)) result.framework = 'chi';
      else if (/gofiber\/fiber/.test(gomod)) result.framework = 'fiber';
    }
    if (!result.database) {
      if (/gorm\.io\/gorm|jinzhu\/gorm/.test(gomod)) result.database = 'gorm';
      else if (/entgo\.io\/ent/.test(gomod)) result.database = 'ent';
      else if (/jackc\/pgx/.test(gomod)) result.database = 'pgx';
      else if (/jmoiron\/sqlx/.test(gomod)) result.database = 'sqlx';
    }
  }
  if (has('Cargo.toml')) {
    if (!result.languages.includes('rust')) result.languages.push('rust');
    touched = true;
  }
  if (has('Gemfile')) {
    if (!result.languages.includes('ruby')) result.languages.push('ruby');
    touched = true;
  }
  if (has('pom.xml', 'build.gradle', 'build.gradle.kts')) {
    if (!result.languages.includes('java/kotlin')) result.languages.push('java/kotlin');
    touched = true;
  }
  if (has('composer.json')) {
    if (!result.languages.includes('php')) result.languages.push('php');
    touched = true;
    // Framework detection from composer.json
    const composer = read('composer.json');
    if (composer.includes('"laravel/framework"') && !result.framework) {
      result.framework = 'laravel';
      result.labels.push('laravel');
    } else if (composer.includes('"symfony/') && !result.framework) {
      result.framework = 'symfony';
      result.labels.push('symfony');
    }
  }
  if (has('pubspec.yaml')) {
    if (!result.languages.includes('dart/flutter')) result.languages.push('dart/flutter');
    result.hasMobile = true;
    if (!result.labels.includes('flutter')) result.labels.push('flutter');
    touched = true;
  }
  if (has('Package.swift') || hasEntryMatching(/\.xcodeproj$/) || existsSync(join(dirAbs, 'ios'))) {
    if (!result.languages.includes('swift/objc')) result.languages.push('swift/objc');
    result.hasMobile = true;
    touched = true;
  }
  if (existsSync(join(dirAbs, 'android')) && has('build.gradle', 'build.gradle.kts', 'pubspec.yaml', 'package.json')) {
    result.hasMobile = true;
    touched = true;
  }

  // --- Package manager (only set first time we see one) ---
  if (!result.packageManager) {
    if (has('pnpm-lock.yaml', 'pnpm-workspace.yaml')) result.packageManager = 'pnpm';
    else if (has('yarn.lock')) result.packageManager = 'yarn';
    else if (has('package-lock.json')) result.packageManager = 'npm';
    else if (has('bun.lockb')) result.packageManager = 'bun';
    else if (has('composer.lock')) result.packageManager = 'composer';
    else if (has('Cargo.lock')) result.packageManager = 'cargo';
    else if (has('go.sum')) result.packageManager = 'go-mod';
    else if (has('Gemfile.lock')) result.packageManager = 'bundler';
    else if (has('poetry.lock')) result.packageManager = 'poetry';
    else if (has('uv.lock')) result.packageManager = 'uv';
  }

  // --- Node framework / frontend detection from package.json ---
  const pkgJson = read('package.json');
  if (pkgJson) {
    if (!result.framework) {
      if (pkgJson.includes('"next"')) { result.framework = 'next.js'; result.hasFrontend = true; result.labels.push('nextjs'); }
      else if (pkgJson.includes('"vite"')) { result.framework = 'vite'; result.hasFrontend = true; result.labels.push('vite'); }
      else if (pkgJson.includes('"@remix-run/')) { result.framework = 'remix'; result.hasFrontend = true; }
      else if (pkgJson.includes('"@sveltejs/kit"')) { result.framework = 'sveltekit'; result.hasFrontend = true; }
      else if (pkgJson.includes('"nuxt"')) { result.framework = 'nuxt'; result.hasFrontend = true; }
      else if (pkgJson.includes('"astro"')) { result.framework = 'astro'; result.hasFrontend = true; }
      else if (pkgJson.includes('"express"')) { result.framework = 'express'; }
      else if (pkgJson.includes('"fastify"')) { result.framework = 'fastify'; }
      else if (pkgJson.includes('"hono"')) { result.framework = 'hono'; }
    }
    if (pkgJson.includes('"react"') || pkgJson.includes('"vue"') || pkgJson.includes('"svelte"') || pkgJson.includes('"solid-js"')) {
      result.hasFrontend = true;
    }
    if (pkgJson.includes('"tailwindcss"') && !result.labels.includes('tailwind')) result.labels.push('tailwind');
    if (pkgJson.includes('"react-native"') || pkgJson.includes('"expo"')) {
      result.hasMobile = true;
      if (!result.labels.includes('react-native')) result.labels.push('react-native');
    }
  }

  // --- Mobile (Flutter/Pubspec already handled above) ---

  // --- Infrastructure-as-code ---
  if (has('terraform', 'pulumi', 'cdk.json')) result.hasInfra = true;
  // .tf files at this level
  try {
    if (readdirSync(dirAbs).some((f) => f.endsWith('.tf'))) result.hasInfra = true;
  } catch {}

  // --- Docker ---
  if (has('Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml') && !result.labels.includes('docker')) {
    result.labels.push('docker');
  }

  // --- Kubernetes ---
  if (has('k8s', 'kustomization.yaml', 'kustomization.yml', 'helm') && !result.labels.includes('k8s')) {
    result.labels.push('k8s');
  }

  // --- ML ---
  if (has('requirements.txt')) {
    const reqs = read('requirements.txt');
    if (/torch|tensorflow|scikit-learn|transformers|jax|huggingface_hub/.test(reqs)) result.hasML = true;
  }
  if (has('pyproject.toml')) {
    const pyproj = read('pyproject.toml');
    if (/torch|tensorflow|scikit-learn|transformers|jax|huggingface/.test(pyproj)) result.hasML = true;
  }
  if (has('environment.yml', 'environment.yaml')) result.hasML = true; // conda env

  // --- Database ---
  if (!result.database) {
    if (pkgJson.includes('"@prisma/client"')) result.database = 'prisma';
    else if (pkgJson.includes('"drizzle-orm"')) result.database = 'drizzle';
    else if (pkgJson.includes('"@supabase/supabase-js"')) result.database = 'supabase';
    else if (has('prisma/schema.prisma')) result.database = 'prisma';
    else if (has('migrations', 'db/migrate', 'supabase/migrations', 'alembic.ini')) result.database = 'sql-migrations';
    else if (read('composer.json').includes('"laravel/framework"')) result.database = 'eloquent';
  }

  if (touched && !result.detectedIn.includes(subdir)) result.detectedIn.push(subdir);
}

export function detectStack(repoPath: string): DetectedStack {
  const result: DetectedStack = {
    languages: [],
    framework: null,
    database: null,
    hasFrontend: false,
    hasInfra: false,
    hasML: false,
    hasMobile: false,
    packageManager: null,
    labels: [],
    detectedIn: [],
  };

  const subdirs = candidateSubdirs(repoPath);
  for (const subdir of subdirs) {
    detectInDir(repoPath, subdir, result);
  }

  if (result.database) result.labels.push(result.database);
  return result;
}

// Languages the deterministic gen-*.sh generators can actually extract real
// facts from. Used to gate fill-on-first-run: on any other stack the generators
// would emit empty/misleading tables, so we leave the honest placeholder docs
// instead. Keep in sync with the lang/<x>.sh adapters + the JS path.
const GENERATOR_LANGUAGES = new Set([
  'javascript/typescript',
  'python',
  'go',
  'ruby',
  'php',
]);

// True if at least one detected language has a deterministic generator.
export function generatorsSupport(stack: DetectedStack): boolean {
  return stack.languages.some((l) => GENERATOR_LANGUAGES.has(l));
}

// Decide which auto-detected docs files to include based on stack.
export function autoDetectedDocs(stack: DetectedStack): string[] {
  const files: string[] = [];
  if (stack.hasFrontend) files.push('UI.md');
  if (stack.hasInfra) files.push('INFRA.md');
  if (stack.hasML) files.push('ML.md');
  if (stack.hasMobile) files.push('MOBILE.md');
  return files;
}
