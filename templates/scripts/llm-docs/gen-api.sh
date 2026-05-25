#!/usr/bin/env bash
# gen-api.sh — generate docs/API.md
#
# Reads:  app/api/**/route.ts or apps/*/app/api/** (Next.js App Router handlers)
# Writes: stdout
#
# Extracts: HTTP method exports + path inferred from file location

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Find the API route dir — Next.js App Router patterns, with fallbacks
find_api_dir() {
  for p in app/api apps/*/app/api src/app/api src/api src/routes pages/api apps/*/pages/api; do
    [ -d "$p" ] && { echo "$p"; return; }
  done
  echo ""
}
API_DIR=$(find_api_dir)
[ -z "$API_DIR" ] && API_DIR="app/api"  # fallback for header

cat <<EOF
---
owner: generator
edit_authority: [generator, human]
merge_policy: auto
source: scripts/llm-docs/gen-api.sh
updated: $NOW
hash: pending
generated_hash: pending
---

<!-- AUTO-GENERATED — edit will be overwritten on next sync. See: scripts/llm-docs/gen-api.sh -->

# API Surface

> **Anchor:** [↑ ARCHITECTURE.md](./ARCHITECTURE.md) · [← AGENTS.md](../AGENTS.md)
> **Purpose:** Inventory of HTTP endpoints exposed by this repo.
> **Source of truth:** route handlers under [\`$API_DIR/\`](../$API_DIR/)

All endpoints are Next.js Route Handlers (\`route.ts\` files). Auth is via NextAuth session cookies unless noted.

## Endpoint inventory

EOF

if [ -d "$API_DIR" ]; then
  # Find all route.ts files and extract methods
  find "$API_DIR" -name 'route.ts' ! -name '*.test.ts' | sort | while read -r route_file; do
    # Convert file path to URL path
    url_path=$(echo "$route_file" | sed "s|$API_DIR||" | sed 's|/route.ts$||' | sed 's|\[\.\.\.|...|g' | sed 's|\[|:|g' | sed 's|\]||g')
    [ -z "$url_path" ] && url_path="/"
    url_path="/api$url_path"

    # Extract HTTP method exports from the file
    methods=$(grep -E '^export (async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)' "$route_file" 2>/dev/null \
              | sed -E 's/^export (async )?function ([A-Z]+).*/\2/' \
              | sort -u \
              | tr '\n' ',' \
              | sed 's/,$//')

    if [ -n "$methods" ]; then
      echo "### \`$url_path\`"
      echo
      echo "| Method | Notes |"
      echo "|---|---|"
      IFS=',' read -ra method_array <<< "$methods"
      for m in "${method_array[@]}"; do
        echo "| \`$m\` | handler at [\`$route_file\`](../$route_file) |"
      done
      echo
    fi
  done

  # Also list NextAuth catch-all
  if [ -d "$API_DIR/auth/[...nextauth]" ]; then
    cat <<EOF
### \`/api/auth/[...nextauth]\`

| Method | Notes |
|---|---|
| \`*\` | NextAuth catch-all (signin, signout, session, callback, providers) |

EOF
  fi

  # GraphiQL playground (if present anywhere under app/)
  if find . -type d -name 'graphiql' -not -path '*/node_modules/*' 2>/dev/null | head -1 | grep -q .; then
    cat <<EOF
## Playground

| Path | Notes |
|---|---|
| \`/graphiql\` | GraphiQL UI for the \`/api/graphql\` endpoint (dev) |

EOF
  fi
else
  echo
  echo "_No API routes found at \`$API_DIR/\`. API.md is a placeholder until route handlers exist._"
fi

cat <<EOF

## Patterns

_The Bootstrap agent fills in code-specific patterns here — e.g. auth helpers, database singletons, error shapes — based on inspection of the handler code._

---

## See also

- [↑ ARCHITECTURE.md](./ARCHITECTURE.md) — system anchor
- [DATA.md](./DATA.md) — entities these endpoints read/write
- [SECURITY-NOTES.md](./SECURITY-NOTES.md) — auth and authorization model
- [CONVENTIONS.md](./CONVENTIONS.md) — handler patterns
EOF
