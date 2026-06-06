// Detection-layer tests — detect-stack.ts (polyglot stack detection) and
// repo-context.ts (the populate context-gatherer). Lock in the Phase-2 fixes:
// Go framework/DB detection, the *.xcodeproj suffix match, the apps/* schema
// glob, and monorepo app-manifest gathering.
//
// Requires a build (`npm run build`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../dist/lib/detect-stack.js';
import { gatherContext } from '../dist/lib/repo-context.js';

function scratch(build) {
  const dir = mkdtempSync(join(tmpdir(), 'docentic-detect-'));
  build({
    file: (rel, content) => {
      const full = join(dir, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content);
    },
    dir: (rel) => mkdirSync(join(dir, rel), { recursive: true }),
  });
  return dir;
}

test('detects Go web framework and DB from go.mod', () => {
  const repo = scratch(({ file }) => {
    file('go.mod', [
      'module example.com/app',
      'go 1.22',
      'require (',
      '  github.com/gin-gonic/gin v1.10.0',
      '  gorm.io/gorm v1.25.0',
      ')',
    ].join('\n'));
    file('main.go', 'package main');
  });
  try {
    const s = detectStack(repo);
    assert.ok(s.languages.includes('go'), 'go language detected');
    assert.equal(s.framework, 'gin');
    assert.equal(s.database, 'gorm');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('*.xcodeproj is matched by suffix (not a dead existsSync glob)', () => {
  const repo = scratch(({ dir }) => {
    dir('MyApp.xcodeproj');
  });
  try {
    const s = detectStack(repo);
    assert.ok(s.hasMobile, 'an .xcodeproj bundle marks the repo mobile');
    assert.ok(s.languages.includes('swift/objc'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detects a non-JS language (python) with no package.json', () => {
  const repo = scratch(({ file }) => {
    file('pyproject.toml', '[tool.poetry]\nname = "x"');
    file('app/main.py', 'print(1)');
  });
  try {
    const s = detectStack(repo);
    assert.ok(s.languages.includes('python'));
    assert.ok(!s.languages.includes('javascript/typescript'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('gatherContext finds a nested monorepo Prisma schema (apps/* glob expands)', () => {
  const repo = scratch(({ file }) => {
    file('package.json', '{"name":"root","workspaces":["apps/*"]}');
    file('pnpm-workspace.yaml', 'packages:\n  - apps/*');
    file('apps/web/prisma/schema.prisma', 'model User { id Int @id }');
  });
  try {
    const ctx = gatherContext(repo);
    const paths = ctx.schemaFiles.map((s) => s.path);
    assert.ok(
      paths.includes('apps/web/prisma/schema.prisma'),
      `nested schema should be found; got ${JSON.stringify(paths)}`,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('gatherContext appends monorepo app manifests (not just the root)', () => {
  const repo = scratch(({ file }) => {
    file('package.json', '{"name":"root","private":true,"workspaces":["apps/*"]}');
    file('apps/web/package.json', '{"name":"web","dependencies":{"next":"15.0.0"}}');
  });
  try {
    const ctx = gatherContext(repo);
    assert.ok(ctx.manifest.includes('apps/web/package.json'), 'app manifest section header present');
    assert.ok(ctx.manifest.includes('"next"'), 'app dependency surfaced to the LLM');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
