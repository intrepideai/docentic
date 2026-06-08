#!/usr/bin/env bash
# validate.sh — staleness + integrity checks
#
# Modes:
#   (default)         — full validation pass; appends findings to research/_meta/SUGGESTIONS.md
#   --read-only       — compute hashes only; print state JSON to stdout
#   --sweep-tombstones — move expired tombstones to .agents/REMOVALS.md
#
# Never edits manual docs directly. Suggestions only.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/llm-docs/detect-stack.sh
source "$(dirname "$0")/detect-stack.sh"

MODE="${1:-validate}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
INDEX=.agents/index.json
SUGGESTIONS=research/_meta/SUGGESTIONS.md

# ----- helpers -----
log()  { echo "[validate] $*" >&2; }
# Content hash for drift detection. Strips the volatile frontmatter lines
# (`updated:` is re-stamped every generation; `hash:`/`generated_hash:` are
# bookkeeping) so a regenerated-but-unchanged file doesn't read as drift. MUST
# match normalizeForHash() in src/lib/hash.ts and the hash step in MAINTAIN.md.
sha() { sed -E '/^(updated|hash|generated_hash): /d' "$1" 2>/dev/null | sha256sum | cut -d' ' -f1; }

suggest() {
  local kind="$1"; shift
  local msg="$*"
  mkdir -p "$(dirname "$SUGGESTIONS")"
  if [ ! -f "$SUGGESTIONS" ]; then
    cat > "$SUGGESTIONS" <<HEADER
# Suggestions (librarian + validator)

> Auto-appended by maintain-repo pass. Human reviews and applies.
> Do not edit directly — entries are pruned after action.

HEADER
  fi
  {
    echo
    echo "## $NOW · $kind"
    echo
    echo "$msg"
  } >> "$SUGGESTIONS"
}

# ----- mode: read-only -----
if [ "$MODE" = "--read-only" ]; then
  jq --arg now "$NOW" '
    .updated = $now |
    .docs |= map(.computed_hash = "PLACEHOLDER")
  ' "$INDEX" 2>/dev/null || cat "$INDEX"
  exit 0
fi

# ----- mode: sweep tombstones -----
if [ "$MODE" = "--sweep-tombstones" ]; then
  CUTOFF=$(date -u -v-30d +%Y-%m-%d 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%d)
  log "Sweeping tombstones older than $CUTOFF"
  found=0
  for f in AGENTS.md docs/*.md; do
    [ -f "$f" ] || continue
    grep -oE '<!-- REMOVED [0-9]{4}-[0-9]{2}-[0-9]{2}: [^>]*-->' "$f" 2>/dev/null | while read -r tomb; do
      date=$(echo "$tomb" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
      if [[ "$date" < "$CUTOFF" ]]; then
        echo "$NOW | $f | $tomb" >> .agents/REMOVALS.md
        # Note: in production, we'd edit the file to remove the comment.
        # For pilot, just log.
        log "  swept: $f — $tomb"
        found=$((found+1))
      fi
    done
  done
  log "Swept $found tombstone(s)"
  exit 0
fi

# ----- default mode: validation pass -----
log "Running validation pass"
errors=0

# Check 1: every endpoint mentioned in API.md exists as a route handler
log "  - checking API.md endpoints exist"
if [ -f docs/API.md ] && [ -n "${API_DIR:-}" ] && [ -d "$API_DIR" ]; then
  endpoints=$(grep -oE '`/api/[a-zA-Z0-9/_:.-]+`' docs/API.md | tr -d '`' | sort -u || true)
  while IFS= read -r ep; do
    [ -z "$ep" ] && continue
    dir_path=$(echo "$ep" | sed 's|/api/||' | sed 's|:|[|g' | sed 's|/$||')
    if ! find "$API_DIR" -name '*.ts' 2>/dev/null | grep -q "$dir_path" \
       && ! find "$API_DIR" -name '*.ts' 2>/dev/null | grep -q "$(echo "$dir_path" | sed 's|\[[^]]*\]|.*|g')"; then
      suggest "stale: API endpoint" "API.md lists \`$ep\` but no matching route handler found. Verify or remove from API.md."
      errors=$((errors+1))
    fi
  done <<< "$endpoints"
fi

# Check 2: every env var in OPS.md is referenced somewhere
log "  - checking OPS.md env vars are used"
if [ -f docs/OPS.md ] && command -v rg >/dev/null 2>&1; then
  env_vars=$(grep -oE '`[A-Z][A-Z0-9_]{2,}`' docs/OPS.md | tr -d '`' | sort -u || true)
  while IFS= read -r v; do
    [ -z "$v" ] && continue
    # Skip obviously non-env values
    case "$v" in
      MYSQL|TLS|WAF|DDoS|TODO|JSON|HTTPS|HTTP|URL|API|UI|CLI|DSN|PEM|SQL|HTML|CSS|JSX|RSC|MDX) continue;;
    esac
    # shellcheck disable=SC2086
    if ! rg -q "$v" ${SRC_DIRS:-} scripts/ 2>/dev/null; then
      suggest "stale: env var" "OPS.md mentions \`$v\` but it doesn't appear in source. Verify or remove."
      errors=$((errors+1))
    fi
  done <<< "$env_vars"
fi

# Check 3: every internal link resolves to a real file
log "  - checking internal links resolve"
for f in AGENTS.md docs/*.md; do
  [ -f "$f" ] || continue
  links=$(grep -oE '\]\([^)]+\.md[^)]*\)' "$f" 2>/dev/null | sed -E 's/\]\(([^)]+)\)/\1/' | sed 's|#.*||' || true)
  while IFS= read -r link; do
    [ -z "$link" ] && continue
    # Skip URLs
    [[ "$link" =~ ^https?:// ]] && continue
    # Resolve relative to file directory
    base_dir=$(dirname "$f")
    target=$(cd "$base_dir" && readlink -f "$link" 2>/dev/null || echo "$base_dir/$link")
    if [ ! -f "$target" ] && [ ! -f "$base_dir/$link" ]; then
      suggest "broken link" "$f references \`$link\` which doesn't exist."
      errors=$((errors+1))
    fi
  done <<< "$links"
done

# Check 4: file size soft limits
log "  - checking file size soft limits"
check_size() {
  local f="$1"; local limit="$2"
  [ ! -f "$f" ] && return
  local lines; lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$lines" -gt "$limit" ]; then
    suggest "size warning" "$f is $lines lines (soft limit $limit). Consider sharding."
  fi
}
check_size AGENTS.md 200
check_size docs/ARCHITECTURE.md 500
for f in docs/*.md; do
  [ "$f" = "docs/ARCHITECTURE.md" ] && continue
  check_size "$f" 500
done

# Check 5: hash drift detection (informational)
log "  - computing hash drift"
if [ -f "$INDEX" ]; then
  jq -r '.docs[] | "\(.path)|\(.hash)"' "$INDEX" 2>/dev/null | while IFS='|' read -r path stored; do
    [ ! -f "$path" ] && continue
    current=$(sha "$path")
    if [ "$stored" != "pending" ] && [ "$stored" != "$current" ]; then
      log "    hash drift: $path"
    fi
  done
fi

log "Validation pass complete: $errors finding(s)"
echo "$errors"
