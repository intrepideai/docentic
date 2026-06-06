#!/usr/bin/env bash
# gen-stack.sh — generate docs/STACK.md
#
# Reads:  package.json and (if a workspace) apps/*/package.json, pnpm-workspace.yaml
# Writes: stdout (orchestrator handles writing to docs/STACK.md with conflict check)
#
# Part of: scripts/llm-docs/MAINTAIN.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/llm-docs/detect-stack.sh
source "$(dirname "$0")/detect-stack.sh"

# Remember detect-stack's language-aware package manager before the JS path
# below overwrites PACKAGE_MANAGER from package.json's corepack field.
DETECT_PM="${PACKAGE_MANAGER:-}"

# Per-language adapter (provides lang_stack for Python/Go/Ruby/PHP).
_LANG_ADAPTER="$(dirname "$0")/lang/${LANGUAGE:-unknown}.sh"
# shellcheck source=/dev/null
[ -f "$_LANG_ADAPTER" ] && source "$_LANG_ADAPTER"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---- Non-JS path: emit frontmatter, delegate the body to the language
# adapter, and exit. The JS/TS logic below is left completely untouched. ----
if [ "${LANGUAGE:-unknown}" != "js-ts" ] && type lang_stack >/dev/null 2>&1; then
  cat <<EOF
---
owner: generator
edit_authority: [generator, human]
merge_policy: auto
source: scripts/llm-docs/gen-stack.sh
updated: $NOW
hash: pending
generated_hash: pending
---

<!-- AUTO-GENERATED — edit will be overwritten on next sync. See: scripts/llm-docs/gen-stack.sh -->

# Stack

> **Anchor:** [↑ ARCHITECTURE.md](./ARCHITECTURE.md) · [← AGENTS.md](../AGENTS.md)
> **Purpose:** Tech stack and runtime versions for this repo.
EOF
  lang_stack
  cat <<EOF

---

## See also

- [↑ ARCHITECTURE.md](./ARCHITECTURE.md) — system anchor
- [INTEGRATIONS.md](./INTEGRATIONS.md) — third-party services
- [OPS.md](./OPS.md) — runtime config & deploy
EOF
  exit 0
fi

# Helper: extract a field from a package.json
pkg_field() {
  jq -r "$2 // empty" "$1" 2>/dev/null || true
}

# --- Root package info ---
ROOT_NAME=$(pkg_field package.json '.name')
ROOT_VERSION=$(pkg_field package.json '.version')
NODE_ENGINE=$(pkg_field package.json '.engines.node')
PNPM_ENGINE=$(pkg_field package.json '.engines.pnpm')
PACKAGE_MANAGER=$(pkg_field package.json '.packageManager')
# Fall back to the lockfile-derived manager (npm/pnpm/yarn/bun) when the
# corepack `.packageManager` field is absent — otherwise the row renders blank.
[ -z "$PACKAGE_MANAGER" ] && PACKAGE_MANAGER="$DETECT_PM"

# --- Workspace packages ---
WORKSPACE_PACKAGES=()
if [ -d packages ]; then
  while IFS= read -r line; do
    WORKSPACE_PACKAGES+=("$(basename "$line")")
  done < <(find packages -mindepth 1 -maxdepth 1 -type d | sort)
fi
APPS_PACKAGES=()
if [ -d apps ]; then
  while IFS= read -r line; do
    APPS_PACKAGES+=("$(basename "$line")")
  done < <(find apps -mindepth 1 -maxdepth 1 -type d | sort)
fi

# --- Catalog versions (from pnpm-workspace.yaml) ---
CATALOG_BLOCK=""
if [ -f pnpm-workspace.yaml ]; then
  CATALOG_BLOCK=$(awk '
    /^catalog:/ { in_catalog=1; next }
    /^[a-z]+:/ && in_catalog { in_catalog=0 }
    in_catalog && /^  / { print }
  ' pnpm-workspace.yaml)
fi

# --- Detect key technologies ---
# Detect in the primary app's package.json (root if single-package, else first apps/*)
detect_dep() {
  [ -z "$APP_PKG" ] && return
  jq -r --arg name "$1" '
    (.dependencies // {}) + (.devDependencies // {}) | .[$name] // empty
  ' "$APP_PKG" 2>/dev/null
}

NEXT_VERSION=$(detect_dep next || true)
REACT_VERSION=$(detect_dep react || true)
PRISMA_VERSION=$(detect_dep '@prisma/client' || true)
SENTRY_VERSION=$(detect_dep '@sentry/nextjs' || true)
TAILWIND_VERSION=$(detect_dep tailwindcss || true)
SUPABASE_VERSION=$(detect_dep '@supabase/supabase-js' || true)
NEXTAUTH_VERSION=$(detect_dep 'next-auth' || true)
DRIZZLE_VERSION=$(detect_dep 'drizzle-orm' || true)
EXPRESS_VERSION=$(detect_dep express || true)
VITE_VERSION=$(detect_dep vite || true)
FASTIFY_VERSION=$(detect_dep fastify || true)
HONO_VERSION=$(detect_dep hono || true)
TANSTACK_VERSION=$(detect_dep '@tanstack/react-query' || true)
PASSPORT_VERSION=$(detect_dep passport || true)
RESEND_VERSION=$(detect_dep resend || true)
GOOGLEAPIS_VERSION=$(detect_dep googleapis || true)
OCTOKIT_VERSION=$(detect_dep '@octokit/rest' || true)

# --- Output ---
cat <<EOF
---
owner: generator
edit_authority: [generator, human]
merge_policy: auto
source: scripts/llm-docs/gen-stack.sh
updated: $NOW
hash: pending
generated_hash: pending
---

<!-- AUTO-GENERATED — edit will be overwritten on next sync. See: scripts/llm-docs/gen-stack.sh -->

# Stack

> **Anchor:** [↑ ARCHITECTURE.md](./ARCHITECTURE.md) · [← AGENTS.md](../AGENTS.md)
> **Purpose:** Tech stack and runtime versions for this repo.
> **Source of truth:** [\`package.json\`](../package.json)$( [ "$IS_MONOREPO" = "true" ] && echo ", [\`$APP_PKG\`](../$APP_PKG)" )

## Repo

| Field | Value |
|---|---|
| Name | \`$ROOT_NAME\` |
| Version | \`$ROOT_VERSION\` |
| Package manager | \`$PACKAGE_MANAGER\` |

## Runtime

| Component | Version |
|---|---|
| Node | \`$NODE_ENGINE\` |
| pnpm | \`$PNPM_ENGINE\` |

## Key dependencies (from \`$APP_PKG\`)

| Component | Version |
|---|---|
EOF

[ -n "$NEXT_VERSION" ]        && echo "| Next.js              | \`$NEXT_VERSION\` |"
[ -n "$REACT_VERSION" ]       && echo "| React                | \`$REACT_VERSION\` |"
[ -n "$EXPRESS_VERSION" ]     && echo "| Express              | \`$EXPRESS_VERSION\` |"
[ -n "$FASTIFY_VERSION" ]     && echo "| Fastify              | \`$FASTIFY_VERSION\` |"
[ -n "$HONO_VERSION" ]        && echo "| Hono                 | \`$HONO_VERSION\` |"
[ -n "$VITE_VERSION" ]        && echo "| Vite                 | \`$VITE_VERSION\` |"
[ -n "$PRISMA_VERSION" ]      && echo "| Prisma               | \`$PRISMA_VERSION\` |"
[ -n "$DRIZZLE_VERSION" ]     && echo "| Drizzle ORM          | \`$DRIZZLE_VERSION\` |"
[ -n "$NEXTAUTH_VERSION" ]    && echo "| NextAuth             | \`$NEXTAUTH_VERSION\` |"
[ -n "$TAILWIND_VERSION" ]    && echo "| Tailwind CSS         | \`$TAILWIND_VERSION\` |"
[ -n "$SENTRY_VERSION" ]      && echo "| Sentry (nextjs)      | \`$SENTRY_VERSION\` |"
[ -n "$SUPABASE_VERSION" ]    && echo "| @supabase/supabase-js | \`$SUPABASE_VERSION\` |"
[ -n "$TANSTACK_VERSION" ]    && echo "| TanStack Query       | \`$TANSTACK_VERSION\` |"
[ -n "$PASSPORT_VERSION" ]    && echo "| Passport.js          | \`$PASSPORT_VERSION\` |"
[ -n "$RESEND_VERSION" ]      && echo "| Resend               | \`$RESEND_VERSION\` |"
[ -n "$GOOGLEAPIS_VERSION" ]  && echo "| Google APIs          | \`$GOOGLEAPIS_VERSION\` |"
[ -n "$OCTOKIT_VERSION" ]     && echo "| @octokit/rest        | \`$OCTOKIT_VERSION\` |"

if [ "$IS_MONOREPO" = "true" ]; then
cat <<EOF

## Workspaces

### Apps (${#APPS_PACKAGES[@]})

EOF
for app in "${APPS_PACKAGES[@]+"${APPS_PACKAGES[@]}"}"; do
  echo "- \`apps/$app\`"
done

cat <<EOF

### Packages (${#WORKSPACE_PACKAGES[@]})

EOF
for pkg in "${WORKSPACE_PACKAGES[@]+"${WORKSPACE_PACKAGES[@]}"}"; do
  echo "- \`packages/$pkg\`"
done
fi

if [ -n "$CATALOG_BLOCK" ]; then
cat <<EOF

## Catalog versions

Shared dependency versions defined in workspace catalog:

\`\`\`yaml
$CATALOG_BLOCK
\`\`\`
EOF
fi

cat <<EOF

---

## See also

- [↑ ARCHITECTURE.md](./ARCHITECTURE.md) — system anchor
- [INTEGRATIONS.md](./INTEGRATIONS.md) — third-party services
- [OPS.md](./OPS.md) — runtime config & deploy
EOF
