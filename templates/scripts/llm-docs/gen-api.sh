#!/usr/bin/env bash
# gen-api.sh — generate docs/API.md
#
# Reads:  route files under API_DIR (detected by detect-stack.sh)
#           Next.js App Router: app/api/**/route.ts
#           Express:            server/routes/*.ts
#           Fastify:            routes/**/*.ts
#           Hono:               entry file where "new Hono" appears
# Writes: stdout

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/llm-docs/detect-stack.sh
source "$(dirname "$0")/detect-stack.sh"

# Load the per-language adapter (Python/Go/Ruby/PHP) if one ships for this
# LANGUAGE. JS/TS stays inline below; adapters provide lang_api / lang_data / …
_LANG_ADAPTER="$(dirname "$0")/lang/${LANGUAGE:-unknown}.sh"
# shellcheck source=/dev/null
[ -f "$_LANG_ADAPTER" ] && source "$_LANG_ADAPTER"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Header labels — adapt to the detected language when there's no JS STACK_TYPE.
DISPLAY_DIR="${API_DIR:-<none detected>}"
STACK_LABEL="$STACK_TYPE"
SOT="route handlers under [\`$DISPLAY_DIR/\`](../$DISPLAY_DIR/)"
if [ "$STACK_TYPE" = "unknown" ] && [ "${LANGUAGE:-unknown}" != "unknown" ]; then
  STACK_LABEL="$LANGUAGE"
  SOT="route handlers under \`${SRC_DIRS:-.}\`"
fi

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
> **Source of truth:** $SOT
> **Stack:** \`$STACK_LABEL\`

## Endpoint inventory

EOF

# ---- Next.js App Router ----
if [[ "$STACK_TYPE" == nextjs-* ]] && [ -d "${API_DIR:-}" ]; then
  find "$API_DIR" -name 'route.ts' ! -name '*.test.ts' | sort | while read -r route_file; do
    url_path=$(echo "$route_file" | sed "s|$API_DIR||" | sed 's|/route.ts$||' | sed 's|\[\.\.\.|...|g' | sed 's|\[|:|g' | sed 's|\]||g')
    [ -z "$url_path" ] && url_path="/"
    url_path="/api$url_path"

    methods=$(grep -E '^export (async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)' "$route_file" 2>/dev/null \
              | sed -E 's/^export (async )?function ([A-Z]+).*/\2/' \
              | sort -u | tr '\n' ',' | sed 's/,$//' || true)

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

  # NextAuth catch-all
  if [ -d "$API_DIR/auth/[...nextauth]" ]; then
    cat <<EOF
### \`/api/auth/[...nextauth]\`

| Method | Notes |
|---|---|
| \`*\` | NextAuth catch-all (signin, signout, session, callback, providers) |

EOF
  fi

# ---- Express ----
elif [ "$STACK_TYPE" = "express" ] && [ -d "${API_DIR:-}" ]; then
  echo "| Method | Path | File |"
  echo "|---|---|---|"
  if command -v rg >/dev/null 2>&1; then
    { rg --no-filename -oI '(app|router)\.(get|post|put|patch|delete)\s*\(\s*["'"'"'][^"'"'"']+["'"'"']' \
      "$API_DIR" --type ts 2>/dev/null \
      | sed -E "s/(app|router)\\.([a-z]+)[[:space:]]*\\([[:space:]]*[\"']([^\"']+)[\"'].*/\\2\t\\3/" \
      | awk -F'\t' '{print toupper($1) "\t" $2}' \
      | sort -t$'\t' -k2 \
      | while IFS=$'\t' read -r method path; do
          echo "| \`$method\` | \`$path\` | \`$API_DIR/\` |"
        done; } || true
  else
    { grep -rE '(app|router)\.(get|post|put|patch|delete)\s*\(' "$API_DIR" --include='*.ts' 2>/dev/null \
      | sed -E "s#^([^:]+):.*\\.(get|post|put|patch|delete)[[:space:]]*\\([[:space:]]*[\"']([^\"']+)[\"'].*#\\2\t\\3\t\\1#" \
      | awk -F'\t' '{print toupper($1) "\t" $2 "\t" $3}' \
      | sort -t$'\t' -k2 \
      | while IFS=$'\t' read -r method path file; do
          echo "| \`$method\` | \`$path\` | [\`$file\`](../$file) |"
        done; } || true
  fi
  echo

# ---- Fastify ----
elif [ "$STACK_TYPE" = "fastify" ] && [ -d "${API_DIR:-}" ]; then
  echo "| Method | Path | File |"
  echo "|---|---|---|"
  { grep -rE 'fastify\.(get|post|put|patch|delete)\s*\(' "$API_DIR" --include='*.ts' 2>/dev/null \
    | sed -E "s#^([^:]+):.*fastify\\.(get|post|put|patch|delete)[[:space:]]*\\([[:space:]]*[\"']([^\"']+)[\"'].*#\\2\t\\3\t\\1#" \
    | awk -F'\t' '{print toupper($1) "\t" $2 "\t" $3}' \
    | sort -t$'\t' -k2 \
    | while IFS=$'\t' read -r method path file; do
        echo "| \`$method\` | \`$path\` | [\`$file\`](../$file) |"
      done; } || true
  echo

# ---- Hono ----
elif [ "$STACK_TYPE" = "hono" ] && [ -n "${API_DIR:-}" ] && [ -d "$API_DIR" ]; then
  echo "| Method | Path | File |"
  echo "|---|---|---|"
  { grep -rE '\.(get|post|put|patch|delete)\s*\(' "$API_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null \
    | sed -E "s#^([^:]+):.*\\.(get|post|put|patch|delete)[[:space:]]*\\([[:space:]]*[\"']([^\"']+)[\"'].*#\\2\t\\3\t\\1#" \
    | awk -F'\t' '{print toupper($1) "\t" $2 "\t" $3}' \
    | sort -t$'\t' -k2 \
    | while IFS=$'\t' read -r method path file; do
        echo "| \`$method\` | \`$path\` | [\`$file\`](../$file) |"
      done; } || true
  echo

# ---- Language adapter (Python/Go/Ruby/PHP) ----
elif type lang_api >/dev/null 2>&1; then
  lang_api

# ---- Unknown / no API dir ----
else
  echo "_No API routes found. Stack detected as \`$STACK_LABEL\`; searched \`${API_DIR:-<no dir detected>}\`._"
  echo
  echo "_Once routes are added, re-run \`gen-api.sh\` to populate this file._"
fi

# GraphiQL playground (framework-agnostic check)
if find . -type d -name 'graphiql' -not -path '*/node_modules/*' 2>/dev/null | head -1 | grep -q .; then
  cat <<EOF
## Playground

| Path | Notes |
|---|---|
| \`/graphiql\` | GraphiQL UI for the \`/api/graphql\` endpoint (dev) |

EOF
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
