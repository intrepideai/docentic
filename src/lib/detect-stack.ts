// Stack detection — decides which auto-detected docs files to scaffold
// and labels for .agents/index.json.

import { existsSync, readFileSync } from 'node:fs';
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
  };

  // Language detection
  if (fileExists(repoPath, 'package.json')) result.languages.push('javascript/typescript');
  if (fileExists(repoPath, 'tsconfig.json')) result.labels.push('typescript');
  if (fileExists(repoPath, 'pyproject.toml', 'setup.py', 'requirements.txt'))
    result.languages.push('python');
  if (fileExists(repoPath, 'go.mod')) result.languages.push('go');
  if (fileExists(repoPath, 'Cargo.toml')) result.languages.push('rust');
  if (fileExists(repoPath, 'Gemfile')) result.languages.push('ruby');
  if (fileExists(repoPath, 'pom.xml', 'build.gradle')) result.languages.push('java/kotlin');

  // Package manager
  if (fileExists(repoPath, 'pnpm-lock.yaml', 'pnpm-workspace.yaml')) result.packageManager = 'pnpm';
  else if (fileExists(repoPath, 'yarn.lock')) result.packageManager = 'yarn';
  else if (fileExists(repoPath, 'package-lock.json')) result.packageManager = 'npm';
  else if (fileExists(repoPath, 'bun.lockb')) result.packageManager = 'bun';

  // Framework detection (Node ecosystem)
  const pkgJson = tryRead(repoPath, 'package.json');
  if (pkgJson) {
    if (pkgJson.includes('"next"')) {
      result.framework = 'next.js';
      result.hasFrontend = true;
      result.labels.push('nextjs');
    } else if (pkgJson.includes('"vite"')) {
      result.framework = 'vite';
      result.hasFrontend = true;
      result.labels.push('vite');
    } else if (pkgJson.includes('"@remix-run/')) {
      result.framework = 'remix';
      result.hasFrontend = true;
    } else if (pkgJson.includes('"express"')) {
      result.framework = 'express';
    } else if (pkgJson.includes('"fastify"')) {
      result.framework = 'fastify';
    } else if (pkgJson.includes('"hono"')) {
      result.framework = 'hono';
    }

    if (pkgJson.includes('"react"') || pkgJson.includes('"vue"') || pkgJson.includes('"svelte"')) {
      result.hasFrontend = true;
    }
    if (pkgJson.includes('"tailwindcss"')) result.labels.push('tailwind');
    if (pkgJson.includes('"react-native"') || pkgJson.includes('"expo"')) {
      result.hasMobile = true;
      result.labels.push('react-native');
    }
  }

  // Mobile (native)
  if (fileExists(repoPath, 'ios', 'android', 'pubspec.yaml')) result.hasMobile = true;

  // Infra
  if (fileExists(repoPath, 'terraform', 'pulumi', 'cdk.json')) result.hasInfra = true;
  if (
    fileExists(repoPath, 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml')
  ) {
    result.labels.push('docker');
  }

  // ML
  if (fileExists(repoPath, 'requirements.txt')) {
    const reqs = tryRead(repoPath, 'requirements.txt');
    if (/torch|tensorflow|scikit-learn|transformers|jax/.test(reqs)) result.hasML = true;
  }
  if (fileExists(repoPath, 'pyproject.toml')) {
    const pyproj = tryRead(repoPath, 'pyproject.toml');
    if (/torch|tensorflow|scikit-learn|transformers|jax/.test(pyproj)) result.hasML = true;
  }

  // Database detection
  if (pkgJson.includes('"@prisma/client"')) result.database = 'prisma';
  else if (pkgJson.includes('"drizzle-orm"')) result.database = 'drizzle';
  else if (pkgJson.includes('"@supabase/supabase-js"')) result.database = 'supabase';
  else if (fileExists(repoPath, 'prisma/schema.prisma', 'apps/*/prisma/schema.prisma'))
    result.database = 'prisma';
  else if (
    fileExists(
      repoPath,
      'migrations',
      'db/migrate',
      'supabase/migrations',
      'alembic.ini',
    )
  ) {
    result.database = 'sql-migrations';
  }

  if (result.database) result.labels.push(result.database);

  return result;
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
