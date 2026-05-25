#!/usr/bin/env bash
# gen-integrations.sh — generate docs/INTEGRATIONS.md
#
# Reads:  package.json (root and apps/*/ if workspace)
# Writes: stdout
#
# Detects known third-party services from dependency names + writes a summary.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Find the primary app's package.json — prefer root, then apps/*/package.json
find_app_pkg() {
  if [ -f "package.json" ]; then
    if [ -d "apps" ]; then
      for d in apps/*/; do
        [ -f "${d}package.json" ] && { echo "${d}package.json"; return; }
      done
    fi
    echo "package.json"
  elif [ -d "apps" ]; then
    for d in apps/*/; do
      [ -f "${d}package.json" ] && { echo "${d}package.json"; return; }
    done
  fi
  echo ""
}
APP_PKG=$(find_app_pkg)

# Helper: detect dependency in the primary app's package.json
has_dep() {
  [ -z "$APP_PKG" ] && { echo "false"; return; }
  jq -r --arg name "$1" '
    (.dependencies // {}) + (.devDependencies // {}) | has($name)
  ' "$APP_PKG" 2>/dev/null
}

cat <<EOF
---
owner: generator
edit_authority: [generator, human]
merge_policy: auto
source: scripts/llm-docs/gen-integrations.sh
updated: $NOW
hash: pending
generated_hash: pending
---

<!-- AUTO-GENERATED — edit will be overwritten on next sync. See: scripts/llm-docs/gen-integrations.sh -->

# Integrations

> **Anchor:** [↑ ARCHITECTURE.md](./ARCHITECTURE.md) · [← AGENTS.md](../AGENTS.md)
> **Purpose:** Third-party services and SDKs in use, plus feature flag inventory.
> **Source of truth:** [\`$APP_PKG\`](../$APP_PKG), env vars in [OPS.md](./OPS.md)

## Detected services

| Service | Status | Env vars | SDK |
|---|---|---|---|
EOF

[ "$(has_dep '@prisma/client')" = "true" ]              && echo "| **Database via Prisma** | active | \`DATABASE_URL\` | \`@prisma/client\` |"
[ "$(has_dep 'drizzle-orm')" = "true" ]                 && echo "| **Database via Drizzle** | active | \`DATABASE_URL\` | \`drizzle-orm\` |"
[ "$(has_dep 'next-auth')" = "true" ]                   && echo "| **NextAuth** | active | \`NEXTAUTH_SECRET\`, \`NEXTAUTH_URL\` | \`next-auth\` |"
[ "$(has_dep '@supabase/supabase-js')" = "true" ]       && echo "| **Supabase** | active | \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`, \`SUPABASE_SECRET_KEY\` | \`@supabase/supabase-js\` |"
[ "$(has_dep '@sentry/nextjs')" = "true" ]              && echo "| **Sentry** | active | \`SENTRY_DSN\`, \`SENTRY_AUTH_TOKEN\` | \`@sentry/nextjs\` |"
[ "$(has_dep '@octokit/core')" = "true" ]               && echo "| **GitHub API** | active | \`GITHUB_APP_ID\`, \`GITHUB_APP_PRIVATE_KEY\` | \`@octokit/core\`, \`@octokit/auth-app\` |"
[ "$(has_dep 'stripe')" = "true" ]                      && echo "| **Stripe** | active | \`STRIPE_SECRET_KEY\`, \`STRIPE_WEBHOOK_SECRET\` | \`stripe\` |"
[ "$(has_dep '@anthropic-ai/sdk')" = "true" ]           && echo "| **Anthropic** | active | \`ANTHROPIC_API_KEY\` | \`@anthropic-ai/sdk\` |"
[ "$(has_dep 'openai')" = "true" ]                      && echo "| **OpenAI** | active | \`OPENAI_API_KEY\` | \`openai\` |"
[ "$(has_dep '@tanstack/react-query')" = "true" ]       && echo "| **TanStack Query** | active | — | \`@tanstack/react-query\` |"
[ -d apps/docs/scripts/search ]                          && echo "| **OpenAI** (via ai-commands) | active | \`OPENAI_API_KEY\` | \`packages/ai-commands\` |"

cat <<EOF

## Env vars referenced

EOF

# Find env vars referenced in apps/docs source
if command -v rg >/dev/null 2>&1; then
  ENV_VARS=$(rg --no-filename -oI 'process\.env\.[A-Z_]+' apps/docs --type ts --type tsx 2>/dev/null \
    | sed 's/process\.env\.//' | sort -u | head -40 || true)
  if [ -n "$ENV_VARS" ]; then
    echo "Found in \`apps/docs/\` source files:"
    echo
    while IFS= read -r v; do
      [ -n "$v" ] && echo "- \`$v\`"
    done <<< "$ENV_VARS"
  fi
else
  echo "_ripgrep not installed; env var detection skipped._"
fi

cat <<EOF

## Feature flags

No flag SDK currently installed.

Env-var-based feature toggles (detected and known):

| Env var | Purpose |
|---|---|
| \`SKIP_EMBEDDINGS\` | Skip embedding generation on dev start |
| \`SKIP_SITEMAP\` | Skip sitemap generation in build |
| \`ENABLE_SENTRY\` | Toggle Sentry in dev |
| \`ANALYZE\` | Run bundle analyzer |
| \`NEXT_TELEMETRY_DISABLED\` | Disable Next.js anonymous telemetry |

---

## See also

- [↑ ARCHITECTURE.md](./ARCHITECTURE.md) — system anchor
- [OPS.md](./OPS.md) — env var configuration & secrets
- [SECURITY-NOTES.md](./SECURITY-NOTES.md) — secret handling
- [DECISIONS.md](./DECISIONS.md) — integration ADRs
EOF
