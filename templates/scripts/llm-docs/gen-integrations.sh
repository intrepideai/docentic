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

# shellcheck source=scripts/llm-docs/detect-stack.sh
source "$(dirname "$0")/detect-stack.sh"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Helper: check if a dep is present; prints "true" or "false" for use in [ ] tests
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

# Database / ORM
[ "$(has_dep '@prisma/client')" = "true" ]              && echo "| **Database via Prisma** | active | \`DATABASE_URL\` | \`@prisma/client\` |"
[ "$(has_dep 'drizzle-orm')" = "true" ]                 && echo "| **Database via Drizzle** | active | \`DATABASE_URL\` | \`drizzle-orm\` |"

# Auth
[ "$(has_dep 'next-auth')" = "true" ]                   && echo "| **NextAuth** | active | \`NEXTAUTH_SECRET\`, \`NEXTAUTH_URL\` | \`next-auth\` |"
[ "$(has_dep 'passport')" = "true" ]                    && echo "| **Passport.js (auth)** | active | — | \`passport\` |"
[ "$(has_dep 'express-session')" = "true" ]             && echo "| **express-session** | active | \`SESSION_SECRET\` | \`express-session\` |"
[ "$(has_dep 'connect-pg-simple')" = "true" ]           && echo "| **Session store (Postgres)** | active | \`DATABASE_URL\` | \`connect-pg-simple\` |"
[ "$(has_dep 'bcryptjs')" = "true" ]                    && echo "| **bcryptjs (passwords)** | active | — | \`bcryptjs\` |"

# Storage / BaaS
[ "$(has_dep '@supabase/supabase-js')" = "true" ]       && echo "| **Supabase** | active | \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`, \`SUPABASE_SECRET_KEY\` | \`@supabase/supabase-js\` |"

# Observability
[ "$(has_dep '@sentry/nextjs')" = "true" ]              && echo "| **Sentry** | active | \`SENTRY_DSN\`, \`SENTRY_AUTH_TOKEN\` | \`@sentry/nextjs\` |"
[ "$(has_dep '@sentry/node')" = "true" ]                && echo "| **Sentry** | active | \`SENTRY_DSN\` | \`@sentry/node\` |"

# GitHub
[ "$(has_dep '@octokit/core')" = "true" ]               && echo "| **GitHub API** | active | \`GITHUB_APP_ID\`, \`GITHUB_APP_PRIVATE_KEY\` | \`@octokit/core\` |"
[ "$(has_dep '@octokit/rest')" = "true" ]               && echo "| **GitHub API** | active | \`GITHUB_TOKEN\` | \`@octokit/rest\` |"

# Payments
[ "$(has_dep 'stripe')" = "true" ]                      && echo "| **Stripe** | active | \`STRIPE_SECRET_KEY\`, \`STRIPE_WEBHOOK_SECRET\` | \`stripe\` |"

# AI
[ "$(has_dep '@anthropic-ai/sdk')" = "true" ]           && echo "| **Anthropic** | active | \`ANTHROPIC_API_KEY\` | \`@anthropic-ai/sdk\` |"
[ "$(has_dep 'openai')" = "true" ]                      && echo "| **OpenAI** | active | \`OPENAI_API_KEY\` | \`openai\` |"

# Google
[ "$(has_dep 'googleapis')" = "true" ]                  && echo "| **Google APIs** | active | \`GOOGLE_CLIENT_ID\`, \`GOOGLE_CLIENT_SECRET\` | \`googleapis\` |"

# Email
[ "$(has_dep 'resend')" = "true" ]                      && echo "| **Resend (email)** | active | \`RESEND_API_KEY\` | \`resend\` |"
[ "$(has_dep '@sendgrid/mail')" = "true" ]              && echo "| **SendGrid (email)** | active | \`SENDGRID_API_KEY\` | \`@sendgrid/mail\` |"

# Data fetching / state
[ "$(has_dep '@tanstack/react-query')" = "true" ]       && echo "| **TanStack Query** | active | — | \`@tanstack/react-query\` |"

cat <<EOF

## Env vars referenced

EOF

# Scan detected source dirs for process.env.* references
if command -v rg >/dev/null 2>&1 && [ -n "${SRC_DIRS:-}" ]; then
  # shellcheck disable=SC2086
  ENV_VARS=$(rg --no-filename -oI 'process\.env\.[A-Z_]+' $SRC_DIRS --type ts 2>/dev/null \
    | sed 's/process\.env\.//' | sort -u | head -40 || true)
  if [ -n "$ENV_VARS" ]; then
    echo "Found in source files ($(echo "$SRC_DIRS" | tr ' ' ',')):"
    echo
    while IFS= read -r v; do
      [ -n "$v" ] && echo "- \`$v\`"
    done <<< "$ENV_VARS"
  else
    echo "_No \`process.env.*\` references found in \`$SRC_DIRS\`._"
  fi
elif ! command -v rg >/dev/null 2>&1; then
  echo "_ripgrep not installed; env var detection skipped._"
else
  echo "_No source dirs detected; env var scan skipped._"
fi

cat <<EOF

## Feature flags

No flag SDK currently installed.

Env-var-based feature toggles (scan source for \`process.env.ENABLE_\` / \`process.env.SKIP_\` / \`process.env.DISABLE_\` patterns to identify active flags).

---

## See also

- [↑ ARCHITECTURE.md](./ARCHITECTURE.md) — system anchor
- [OPS.md](./OPS.md) — env var configuration & secrets
- [SECURITY-NOTES.md](./SECURITY-NOTES.md) — secret handling
- [DECISIONS.md](./DECISIONS.md) — integration ADRs
EOF
