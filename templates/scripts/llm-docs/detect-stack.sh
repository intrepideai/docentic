#!/usr/bin/env bash
# detect-stack.sh — shared stack detection library
# Source this file; do not execute directly.
#
# Exports:
#   LANGUAGE        — "js-ts" | "python" | "go" | "rust" | "ruby" | "php" | "java" | "unknown"
#   MANIFEST        — path to the primary manifest (package.json, pyproject.toml, go.mod, …)
#   STACK_TYPE      — "nextjs-monorepo" | "nextjs-single" | "express" | "fastify" | "hono" | "unknown"
#   IS_MONOREPO     — "true" | "false"
#   APP_PKG         — path to primary package.json (js-ts only)
#   APP_ROOT        — path to primary app root dir (e.g. "." or "apps/web")
#   API_DIR         — path to API routes dir (e.g. "app/api" or "server/routes")
#   SCHEMA_FILE     — path to DB schema file
#   SCHEMA_TYPE     — "prisma" | "drizzle" | "none"
#   ORM             — "prisma" | "drizzle" | "none"
#   PACKAGE_MANAGER — npm/pnpm/yarn/bun · pip/poetry/uv/pipenv · go · cargo · bundler · composer · maven/gradle
#   SRC_DIRS        — space-separated list of source dirs for env var search
#
# LANGUAGE is the primary dispatch key: for js-ts this file fills in the full
# framework/ORM/route picture; other languages get a best-effort manifest +
# source-dir set that the generators' per-language adapters build on.

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

# Primary language + manifest. A package.json (even in a monorepo app) means
# js-ts; otherwise the first recognized manifest at the repo root wins.
LANGUAGE="unknown"
MANIFEST=""
if [ -n "$APP_PKG" ] && [ -f "$APP_PKG" ]; then
  LANGUAGE="js-ts"; MANIFEST="$APP_PKG"
elif [ -f "pyproject.toml" ]; then LANGUAGE="python"; MANIFEST="pyproject.toml"
elif [ -f "setup.py" ];        then LANGUAGE="python"; MANIFEST="setup.py"
elif [ -f "requirements.txt" ]; then LANGUAGE="python"; MANIFEST="requirements.txt"
elif [ -f "go.mod" ];          then LANGUAGE="go";     MANIFEST="go.mod"
elif [ -f "Cargo.toml" ];      then LANGUAGE="rust";   MANIFEST="Cargo.toml"
elif [ -f "Gemfile" ];         then LANGUAGE="ruby";   MANIFEST="Gemfile"
elif [ -f "composer.json" ];   then LANGUAGE="php";    MANIFEST="composer.json"
elif [ -f "pom.xml" ];         then LANGUAGE="java";   MANIFEST="pom.xml"
elif [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then LANGUAGE="java"; MANIFEST="build.gradle"
fi

# Package manager, by language. For js-ts the lockfile wins (last match takes
# precedence); other languages key off their canonical lockfile/manifest.
case "$LANGUAGE" in
  js-ts)
    PACKAGE_MANAGER="npm"
    [ -f "package-lock.json" ] && PACKAGE_MANAGER="npm"
    [ -f "yarn.lock" ]         && PACKAGE_MANAGER="yarn"
    [ -f "bun.lockb" ]         && PACKAGE_MANAGER="bun"
    [ -f "pnpm-lock.yaml" ]    && PACKAGE_MANAGER="pnpm"
    ;;
  python)
    PACKAGE_MANAGER="pip"
    [ -f "poetry.lock" ]  && PACKAGE_MANAGER="poetry"
    [ -f "uv.lock" ]      && PACKAGE_MANAGER="uv"
    [ -f "Pipfile.lock" ] && PACKAGE_MANAGER="pipenv"
    ;;
  go)   PACKAGE_MANAGER="go" ;;
  rust) PACKAGE_MANAGER="cargo" ;;
  ruby) PACKAGE_MANAGER="bundler" ;;
  php)  PACKAGE_MANAGER="composer" ;;
  java) [ -f "pom.xml" ] && PACKAGE_MANAGER="maven" || PACKAGE_MANAGER="gradle" ;;
  *)    PACKAGE_MANAGER="" ;;
esac

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

# Source dirs for env var search (used by validate.sh and gen-integrations.sh).
# Language-aware candidate list — the prior JS-only set missed lib/ (where
# Next.js apps keep their Prisma/Stripe/email singletons) and every non-JS dir.
# Append each existing dir among the args to SRC_DIRS. Takes candidates as
# positional args (a function's $@ is local and iterates regardless of IFS), so
# this doesn't depend on the caller's IFS containing a space.
_add_src_dirs() {
  for d in "$@"; do
    [ -d "$d" ] && SRC_DIRS="$SRC_DIRS $d"
  done
  return 0  # never let an absent final candidate fail the caller under `set -e`
}

SRC_DIRS=""
if [ "$IS_MONOREPO" = "true" ]; then
  _add_src_dirs "$APP_ROOT/src" "$APP_ROOT/app" "$APP_ROOT/lib" packages
else
  case "$LANGUAGE" in
    python) _add_src_dirs src app api server tests ;;
    go)     _add_src_dirs cmd internal pkg api server ;;
    rust)   _add_src_dirs src ;;
    ruby)   _add_src_dirs app lib config ;;
    php)    _add_src_dirs app src routes config ;;
    java)   _add_src_dirs src ;;
    *)      _add_src_dirs server client src app shared lib components pages api ;;
  esac
fi
SRC_DIRS="${SRC_DIRS# }"
unset -f _add_src_dirs 2>/dev/null || true

# Normalize: strip leading ./ that find produces when searching from "."
API_DIR="${API_DIR#./}"
SCHEMA_FILE="${SCHEMA_FILE#./}"
