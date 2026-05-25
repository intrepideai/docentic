#!/usr/bin/env bash
# gen-data.sh — generate docs/DATA.md
#
# Reads:  Prisma schema (root prisma/, apps/*/prisma/, or db/)
#         supabase/migrations/*.sql (legacy reference)
# Writes: stdout

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Find a Prisma schema if present — root, then apps/*/prisma/
find_schema() {
  for p in prisma/schema.prisma apps/*/prisma/schema.prisma packages/*/prisma/schema.prisma db/schema.prisma; do
    [ -f "$p" ] && { echo "$p"; return; }
  done
  echo ""
}
SCHEMA=$(find_schema)
[ -z "$SCHEMA" ] && SCHEMA="prisma/schema.prisma"  # fallback for header; doc body handles missing file

cat <<EOF
---
owner: generator
edit_authority: [generator, human]
merge_policy: auto
source: scripts/llm-docs/gen-data.sh
updated: $NOW
hash: pending
generated_hash: pending
---

<!-- AUTO-GENERATED — edit will be overwritten on next sync. See: scripts/llm-docs/gen-data.sh -->

# Data Model

> **Anchor:** [↑ ARCHITECTURE.md](./ARCHITECTURE.md) · [← AGENTS.md](../AGENTS.md)
> **Purpose:** Schema summary, entity relationships, and key access patterns.
> **Source of truth:** [\`$SCHEMA\`](../$SCHEMA)
EOF

if [ -f "$SCHEMA" ]; then
  DATASOURCE=$(grep -A2 'datasource db' "$SCHEMA" | grep provider | awk -F'"' '{print $2}' || echo "unknown")
  cat <<EOF

> **Database:** \`$DATASOURCE\` via Prisma ORM

## Models

EOF

  # Extract model names
  models=$(grep '^model ' "$SCHEMA" | awk '{print $2}' || true)
  for model in $models; do
    echo "### \`$model\`"
    echo
    echo '```prisma'
    awk -v m="$model" '
      $1 == "model" && $2 == m { in_model=1 }
      in_model { print }
      in_model && /^}/ { in_model=0; exit }
    ' "$SCHEMA"
    echo '```'
    echo
  done
else
  echo
  echo "_No Prisma schema found at \`$SCHEMA\` — DATA.md is a placeholder until a schema is added._"
fi

# Legacy migrations reference
LEGACY_MIG_DIR=supabase/migrations
if [ -d "$LEGACY_MIG_DIR" ]; then
  legacy_count=$(find "$LEGACY_MIG_DIR" -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$legacy_count" -gt 0 ]; then
    cat <<EOF

## Supabase-style migrations

\`$LEGACY_MIG_DIR/\` contains $legacy_count migration file(s). If the Prisma schema above is your active source of truth, see [DECISIONS.md](./DECISIONS.md) for context on which one is canonical.

EOF
    find "$LEGACY_MIG_DIR" -name '*.sql' 2>/dev/null | sort | while read -r f; do
      echo "- \`$f\`"
    done
  fi
fi

cat <<EOF

---

## See also

- [↑ ARCHITECTURE.md](./ARCHITECTURE.md) — system anchor
- [API.md](./API.md) — endpoints that read/write this data
- [SECURITY-NOTES.md](./SECURITY-NOTES.md) — access control over these tables
- [DECISIONS.md](./DECISIONS.md) — why MySQL + Prisma
EOF
