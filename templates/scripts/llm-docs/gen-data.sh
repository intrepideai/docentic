#!/usr/bin/env bash
# gen-data.sh — generate docs/DATA.md
#
# Reads:  Prisma schema (root prisma/, apps/*/prisma/, or db/)
#         Drizzle schema (shared/schema.ts, src/db/schema.ts, etc.)
#         supabase/migrations/*.sql (legacy reference)
# Writes: stdout

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/llm-docs/detect-stack.sh
source "$(dirname "$0")/detect-stack.sh"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Drizzle helpers (best-effort — works for standard pgTable / mysqlTable calls)
extract_drizzle_tables() {
  local schema="$1"
  grep -oE '(pgTable|mysqlTable|sqliteTable)\("[^"]+"' "$schema" 2>/dev/null \
    | sed -E 's/.*\("//; s/"$//' \
    | sort -u
}

extract_drizzle_columns() {
  local schema="$1"
  local table="$2"
  awk "/[Tt]able\(\"$table\"/{found=1} found && /[a-zA-Z_]+:/{name=\$1; gsub(/:.*/,\"\",name); print name} /^\}\)/{found=0}" \
    "$schema" 2>/dev/null | head -20
}

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
EOF

# ---- Prisma branch ----
if [ "$SCHEMA_TYPE" = "prisma" ] && [ -n "$SCHEMA_FILE" ]; then
  echo "> **Source of truth:** [\`$SCHEMA_FILE\`](../$SCHEMA_FILE)"

  DATASOURCE=$(grep -A2 'datasource db' "$SCHEMA_FILE" | grep provider | awk -F'"' '{print $2}' || echo "unknown")
  cat <<EOF

> **Database:** \`$DATASOURCE\` via Prisma ORM

## Models

EOF

  models=$(grep '^model ' "$SCHEMA_FILE" | awk '{print $2}' || true)
  for model in $models; do
    echo "### \`$model\`"
    echo
    echo '```prisma'
    awk -v m="$model" '
      $1 == "model" && $2 == m { in_model=1 }
      in_model { print }
      in_model && /^}/ { in_model=0; exit }
    ' "$SCHEMA_FILE"
    echo '```'
    echo
  done

# ---- Drizzle branch ----
elif [ "$SCHEMA_TYPE" = "drizzle" ] && [ -n "$SCHEMA_FILE" ]; then
  echo "> **Source of truth:** [\`$SCHEMA_FILE\`](../$SCHEMA_FILE)"
  cat <<EOF

> **Database:** Drizzle ORM

## Tables

| Table | Key columns |
|---|---|
EOF

  tables=$(extract_drizzle_tables "$SCHEMA_FILE" || true)
  if [ -n "$tables" ]; then
    while IFS= read -r table; do
      [ -z "$table" ] && continue
      cols=$(extract_drizzle_columns "$SCHEMA_FILE" "$table" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
      echo "| \`$table\` | $cols |"
    done <<< "$tables"
  else
    echo "| _(could not parse tables — check schema format)_ | |"
  fi

# ---- No ORM branch ----
else
  cat <<EOF

> **Database:** No ORM schema detected.

EOF
  # Look for raw SQL migrations as a fallback reference
  MIG_DIRS=""
  for d in migrations db/migrations drizzle supabase/migrations; do
    [ -d "$d" ] && MIG_DIRS="$MIG_DIRS $d"
  done
  MIG_DIRS="${MIG_DIRS# }"

  if [ -n "$MIG_DIRS" ]; then
    echo "Raw migration files found (schema derived from these):"
    echo
    for mig_dir in $MIG_DIRS; do
      find "$mig_dir" -name '*.sql' 2>/dev/null | sort | while read -r f; do
        echo "- \`$f\`"
      done
    done
  else
    echo "_No schema file or migration directory found. Add a Prisma schema or Drizzle schema to enable DATA.md generation._"
  fi
fi

# Legacy Supabase migrations reference (applicable regardless of ORM)
LEGACY_MIG_DIR=supabase/migrations
if [ "$SCHEMA_TYPE" != "none" ] && [ -d "$LEGACY_MIG_DIR" ]; then
  legacy_count=$(find "$LEGACY_MIG_DIR" -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$legacy_count" -gt 0 ]; then
    cat <<EOF

## Supabase-style migrations

\`$LEGACY_MIG_DIR/\` contains $legacy_count migration file(s). If the schema above is your active source of truth, see [DECISIONS.md](./DECISIONS.md) for context on which one is canonical.

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
- [DECISIONS.md](./DECISIONS.md) — why this ORM / database
EOF
