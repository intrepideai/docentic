#!/usr/bin/env bash
# detect-stack.sh — shared stack detection library
# Source this file; do not execute directly.
#
# Exports:
#   STACK_TYPE      — "nextjs-monorepo" | "nextjs-single" | "express" | "fastify" | "hono" | "unknown"
#   IS_MONOREPO     — "true" | "false"
#   APP_PKG         — path to primary package.json
#   APP_ROOT        — path to primary app root dir (e.g. "." or "apps/web")
#   API_DIR         — path to API routes dir (e.g. "app/api" or "server/routes")
#   SCHEMA_FILE     — path to DB schema file
#   SCHEMA_TYPE     — "prisma" | "drizzle" | "none"
#   ORM             — "prisma" | "drizzle" | "none"
#   PACKAGE_MANAGER — "npm" | "pnpm" | "yarn" | "bun"
#   SRC_DIRS        — space-separated list of source dirs for env var search

# Monorepo detection: pnpm workspace with an apps/ dir
if [ -d "apps" ] && [ -f "pnpm-workspace.yaml" ]; then
  IS_MONOREPO="true"
  APP_ROOT=""
  for candidate in apps/docs apps/web apps/app; do
    [ -d "$candidate" ] && { APP_ROOT="$candidate"; break; }
  done
  if [ -z "$APP_ROOT" ]; then
    APP_ROOT=$(find apps -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | head -1 || true)
  fi
  APP_PKG="$APP_ROOT/package.json"
else
  IS_MONOREPO="false"
  APP_ROOT="."
  APP_PKG="package.json"
fi

# Package manager — last match wins (most specific lockfile takes precedence)
PACKAGE_MANAGER="npm"
[ -f "package-lock.json" ] && PACKAGE_MANAGER="npm"
[ -f "yarn.lock" ]         && PACKAGE_MANAGER="yarn"
[ -f "bun.lockb" ]         && PACKAGE_MANAGER="bun"
[ -f "pnpm-lock.yaml" ]    && PACKAGE_MANAGER="pnpm"

# Internal helper: exit 0 if dep present in APP_PKG, 1 if absent
_detect_has_dep() {
  [ -z "$APP_PKG" ] && return 1
  [ ! -f "$APP_PKG" ] && return 1
  jq -e --arg n "$1" '(.dependencies//{})+(.devDependencies//{})|has($n)' "$APP_PKG" >/dev/null 2>&1
}

# ORM / schema detection
if find . -name 'schema.prisma' -not -path '*/node_modules/*' 2>/dev/null | grep -q .; then
  ORM="prisma"
  SCHEMA_TYPE="prisma"
  SCHEMA_FILE=$(find . -name 'schema.prisma' -not -path '*/node_modules/*' 2>/dev/null | head -1 || true)
elif _detect_has_dep "drizzle-orm"; then
  ORM="drizzle"
  SCHEMA_TYPE="drizzle"
  SCHEMA_FILE=""
  for candidate in shared/schema.ts src/db/schema.ts db/schema.ts server/schema.ts; do
    [ -f "$candidate" ] && { SCHEMA_FILE="$candidate"; break; }
  done
else
  ORM="none"
  SCHEMA_TYPE="none"
  SCHEMA_FILE=""
fi

# Framework detection + API dir
API_DIR=""
if _detect_has_dep "next"; then
  [ "$IS_MONOREPO" = "true" ] && STACK_TYPE="nextjs-monorepo" || STACK_TYPE="nextjs-single"
  for candidate in "$APP_ROOT/app/api" "$APP_ROOT/src/app/api" "$APP_ROOT/pages/api" "$APP_ROOT/src/pages/api"; do
    [ -d "$candidate" ] && { API_DIR="$candidate"; break; }
  done
elif _detect_has_dep "fastify"; then
  STACK_TYPE="fastify"
  API_DIR=$(find . -type d -name "routes" -not -path '*/node_modules/*' 2>/dev/null | head -1 || true)
elif _detect_has_dep "hono"; then
  STACK_TYPE="hono"
  # Best-effort: find the file that instantiates Hono and use its directory
  _hono_entry=$(grep -rl "new Hono" . --include='*.ts' --include='*.tsx' --exclude-dir=node_modules 2>/dev/null | head -1 || true)
  [ -n "${_hono_entry:-}" ] && API_DIR=$(dirname "$_hono_entry")
  unset _hono_entry
elif _detect_has_dep "express"; then
  STACK_TYPE="express"
  for candidate in server/routes src/routes routes; do
    [ -d "$candidate" ] && { API_DIR="$candidate"; break; }
  done
else
  STACK_TYPE="unknown"
fi

# Source dirs for env var search (used by validate.sh and gen-integrations.sh)
if [ "$IS_MONOREPO" = "true" ]; then
  SRC_DIRS="$APP_ROOT/src $APP_ROOT/app packages"
else
  SRC_DIRS=""
  for d in server client src app shared; do
    [ -d "$d" ] && SRC_DIRS="$SRC_DIRS $d"
  done
  SRC_DIRS="${SRC_DIRS# }"
fi

# Normalize: strip leading ./ that find produces when searching from "."
API_DIR="${API_DIR#./}"
SCHEMA_FILE="${SCHEMA_FILE#./}"
