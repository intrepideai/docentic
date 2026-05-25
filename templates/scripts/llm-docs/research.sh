#!/usr/bin/env bash
# research.sh — research pipeline orchestrator
#
# Runs: scouts (parallel) → researcher → librarian
# Reads config from research/config.yml
#
# Each agent invocation is delegated to whatever runtime the host provides.
# This script just sequences them and handles dedup state.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

CONFIG=research/config.yml
QUEUE=research/intake/QUEUE.md
LOG=research/intake/DISCOVERY_LOG.md
PROMPTS=scripts/llm-docs/prompts

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log() { echo "[research] $*" >&2; }

# ----- preflight -----
if [ ! -f "$CONFIG" ]; then
  log "ERROR: $CONFIG not found. Run bootstrap or build research/ first."
  exit 1
fi
mkdir -p research/intake research/topics research/ideas research/archive research/_meta

# Helper: which scouts are due based on cadence
# (Simplified: in production, parse YAML properly with yq)
SCOUTS_DUE=()
for scout in x github arxiv web hf reddit hn rss lobsters youtube; do
  prompt_file="$PROMPTS/scouts/$scout.md"
  if [ -f "$prompt_file" ]; then
    SCOUTS_DUE+=("$scout")
  fi
done

log "Pipeline starting at $NOW"
log "Scouts available: ${SCOUTS_DUE[*]}"

# ----- 4a: scouts (parallel) -----
# In production: invoke each scout as a parallel agent call.
# For pilot scaffold, we log the intended invocations.
log "Step 4a: scouts"
for scout in "${SCOUTS_DUE[@]}"; do
  log "  would invoke: agent --prompt $PROMPTS/scouts/$scout.md --config $CONFIG"
  # Real invocation depends on host runtime, e.g.:
  #   claude --skill scouts/$scout --output-file /tmp/scout-$scout.log
  # For now, scout invocations are wired up via the GitHub Action (.github/workflows/llm-docs.yml)
done

# ----- 4b: researcher -----
log "Step 4b: researcher"
log "  would invoke: agent --prompt $PROMPTS/researcher.md --config $CONFIG"

# ----- 4c: librarian -----
log "Step 4c: librarian"
log "  would invoke: agent --prompt $PROMPTS/librarian.md --config $CONFIG"

# ----- log run -----
mkdir -p "$(dirname "$LOG")"
if [ ! -f "$LOG" ]; then
  cat > "$LOG" <<HEADER
# Research Discovery Log

> Append-only log of scout / researcher / librarian runs.

HEADER
fi

cat >> "$LOG" <<EOF

### $NOW — research.sh orchestrator run
- Scouts invoked: ${SCOUTS_DUE[*]}
- (Pilot scaffold — real agent invocations wired via .github/workflows/llm-docs.yml)
EOF

log "Pipeline complete"
