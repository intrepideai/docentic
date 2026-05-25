# maintain-repo — Orchestrator Skill

> **You are reading the entry point.** If an external orchestrator pointed an agent at a file in this repo to "go execute and keep everything up to date," this is that file. Read top to bottom, then execute the 8-step pass below.
>
> **Vendor-neutral.** Any agent runtime (Claude Code, raw Anthropic API, Cursor, etc.) can follow this file. Claude Code users get a thin wrapper at [`.claude/skills/maintain-repo/SKILL.md`](../../.claude/skills/maintain-repo/SKILL.md) that just routes here.
>
> **Spec it implements:** <https://github.com/intrepideai/docent#readme>

## How invocation works

This skill is **not triggered by CI cron**. An external agent orchestrator (managed elsewhere) periodically points an agent at this repo with a prompt along the lines of:

> "Go to `<repo>/scripts/llm-docs/MAINTAIN.md` and execute it. Keep everything up to date. Commit changes and open a PR when done."

The agent that lands here is responsible for everything — reading state, running scripts, invoking sub-agents for research/history, opening a PR. **No CI workflow runs the AI steps.** CI may exist for deterministic checks on PRs, but it does not orchestrate maintenance.

## When you (the agent) should invoke this skill

- An external orchestrator pointed you at this file or the wrapper at [`.claude/skills/maintain-repo/SKILL.md`](../../.claude/skills/maintain-repo/SKILL.md)
- A human said "run maintenance," "refresh the docs," "update the repo"
- You're being run on demand against a freshly-cloned worktree

## When NOT to invoke

- During active feature development — this is a maintenance pass, not authoring
- When making a specific architectural change — open a normal PR for that
- When adding net-new content — write it directly, let the next maintenance pass pick up the hash

## The 8-step pass

```
1. Read state         — load .agents/index.json, compute current hashes
2. Run generators     — STACK / DATA / API / MAP / INTEGRATIONS
                        ⚠ conflict check before write
3. Run validators     — check docs against code reality
                        ⚠ broken links in manual files → SUGGESTIONS.md (don't edit)
4. Research pass      — scouts (parallel) → researcher → librarian
5. AI HISTORY pass    — append yesterday's significant commits
                        ⚠ output NO_UPDATE_NEEDED if nothing material
6. Update index       — refresh .agents/index.json with new hashes
7. Open PR or no-op   — single PR for all changes, or exit silently
8. Sweep tombstones   — move tombstones older than 30 days to .agents/REMOVALS.md
```

Detailed step-by-step below.

---

## Step 1 — Read state

```bash
bash scripts/llm-docs/validate.sh --read-only
```

This loads `.agents/index.json` and computes a current `sha256` hash for every file listed. Outputs a state object the rest of the pass consumes.

For each file, decide:
- **No change since last sync** (`current_hash == stored_hash == generated_hash`) → skip in step 2
- **Generator output changed** (would-be-new hash ≠ `generated_hash`) → regenerate in step 2
- **Human edited a generated file** (`current_hash != generated_hash`) → conflict mode in step 2

---

## Step 2 — Run generators

For each `owner: generator` file in `.agents/index.json`:

```bash
# Example for STACK.md
bash scripts/llm-docs/gen-stack.sh > /tmp/STACK.md.new
new_hash=$(sha256sum /tmp/STACK.md.new | cut -d' ' -f1)
current_hash=$(sha256sum docs/STACK.md | cut -d' ' -f1)
stored_generated_hash=$(jq -r '.docs[] | select(.path == "docs/STACK.md") | .generated_hash' .agents/index.json)

if [ "$current_hash" = "$stored_generated_hash" ]; then
  # No human edit — safe to overwrite
  if [ "$new_hash" != "$stored_generated_hash" ]; then
    cp /tmp/STACK.md.new docs/STACK.md
    # Update generated_hash in index.json
  fi
else
  # Human edited — STOP. Open conflict PR instead.
  echo "CONFLICT: docs/STACK.md was manually edited"
  # Create PR labeled "conflict: human edit detected"
  # Show three views: current | regenerated | human's diff
fi
```

**Rules:**
- Never overwrite a manually-edited generated file
- Tombstone any removed sections: `<!-- REMOVED YYYY-MM-DD: <section> — <reason> -->`
- Each generator outputs the full file to stdout; the orchestrator handles writes

---

## Step 3 — Run validators

```bash
bash scripts/llm-docs/validate.sh
```

Validates manual files for staleness against code reality:

| Check | Behavior on failure |
|---|---|
| Every endpoint in `docs/API.md` exists in `apps/docs/app/api/**/route.ts` | Append to `research/_meta/SUGGESTIONS.md` — never edit API.md directly |
| Every env var in `docs/OPS.md` referenced somewhere in `apps/docs/` | Append to SUGGESTIONS.md |
| Every internal link in any doc resolves to a real file | Append to SUGGESTIONS.md |
| Every dependency mentioned in `docs/INTEGRATIONS.md` exists in `package.json` | Append to SUGGESTIONS.md |
| File size soft-limit not exceeded (AGENTS.md ≤ 200, others ≤ 500 lines) | Append warning to SUGGESTIONS.md |
| Hash field in index.json matches file content | Update hash in index.json |

**Rule:** validators NEVER edit manual files. They suggest only.

---

## Step 4 — Research pass

```bash
bash scripts/llm-docs/research.sh
```

This script orchestrates the research pipeline.

### 4a — Scouts (parallel)

Each scout runs as a separate agent invocation. Inputs:
- `research/config.yml` — topics, keywords, sources, caps
- `research/intake/QUEUE.md` — for dedup check before append
- `research/index.json` — `seen_urls` cache (local + org-level if available)

Scout prompts at `scripts/llm-docs/prompts/scouts/*.md`. Each must:
1. Load config and check what's due (`cadence`)
2. Search per source-specific rules
3. Filter by relevance threshold + dedup
4. Append up to `caps.per_scout_per_run` items to `research/intake/QUEUE.md ## Pending`
5. Append run summary to `research/intake/DISCOVERY_LOG.md`
6. Exit

Hard caps: 3 per scout per run (configurable in `research/config.yml`).

### 4b — Researcher

```bash
# Invoked after all scouts complete
agent --prompt scripts/llm-docs/prompts/researcher.md
```

The researcher:
1. Reads `research/intake/QUEUE.md ## Pending`
2. Scores each item by priority = `relevance × source_quality × recency_weight`
3. Moves top-N (default 20) to `## Processing`
4. Groups by type (paper / project / article / thread)
5. Spawns parallel sub-agents per type
6. Each sub-agent writes a research file to `research/topics/<topic>/<type>/<slug>.md`
7. Moves processed items to `## Processed` with output paths
8. Logs run to `research/intake/DISCOVERY_LOG.md`

Items with `relevance: low` may be archived immediately without writing a file.

### 4c — Librarian

```bash
agent --prompt scripts/llm-docs/prompts/librarian.md
```

The librarian (daily curation):
1. Categorize uncategorized files into topic folders
2. Score every research item on 5 axes (Freshness, Quality, Relevance, Engagement, Evergreen)
3. Rebuild 6 views in `research/_meta/`:
   - `DIGEST.md` — last 24h, time-ordered
   - `TOP-IDEAS.md` — all-time, quality × engagement
   - `BY-TOPIC.md` — per-topic top items
   - `ACTIONABLE.md` — feasibility × impact
   - `EVERGREEN.md` — quality, age ≥ 90d
   - `COVERAGE.md` — topic counts vs gaps
4. Surface promotion candidates (high-relevance, mature items) in `SUGGESTIONS.md`
5. Suggest doc edits for `manual` files in `SUGGESTIONS.md`
6. Auto-archive per config (`auto_archive` settings)
7. Trim QUEUE.md processed section (keep 7 days, rest to archive)
8. Update `research/index.json`

**Librarian never deletes** — only moves/archives/tombstones.

---

## Step 5 — AI HISTORY pass

```bash
agent --prompt scripts/llm-docs/prompts/history.md \
      --context "$(git log --since='24 hours ago' --pretty=format:'%h %s' --no-merges)"
```

The history prompt:
1. Reads yesterday's commits
2. If commits are trivial (deps bumps, formatting, no code change) → output `NO_UPDATE_NEEDED`
3. Else: write 1-3 bullets capturing what changed and *why*
4. Append to `docs/HISTORY.md` (append-only, max 3 bullets per day)

Default merge policy for HISTORY.md: `auto_delayed:4h` (auto-merge after 4 hours of no human objection).

---

## Step 6 — Update .agents/index.json

For every file we touched in steps 2-5:
- Recompute `hash` = `sha256(current content)`
- For generated files: update `generated_hash` = the hash the generator produced
- Update `updated` timestamp
- Recount `research.library_size`
- Refresh `research.last_research_pass`
- Update `health.stale_files`, `health.validation_errors`, `health.conflicts`

---

## Step 7 — Open PR or no-op

If anything changed across steps 2-6, the agent (not CI) opens the PR:

```bash
# Run from the repo root inside the agent's worktree
git checkout -b llm-docs/maintain-$(date +%Y%m%d-%H%M)
git add -A
git commit -m "chore(llm-docs): maintenance pass

- Generators: $GENERATED_FILES_CHANGED
- AI: $AI_FILES_CHANGED
- Research: $RESEARCH_ITEMS_ADDED new items
- Validation: $VALIDATION_FINDINGS findings in SUGGESTIONS.md

See .agents/index.json for full state."
git push origin HEAD
gh pr create --title "$TITLE" --body "$BODY" --label llm-docs
```

The agent must have repo write access + `gh` CLI authenticated. The external orchestrator is responsible for setting that up before pointing the agent here.

PR labeled `llm-docs`. Merge gate per `merge_policy`:
- Generated files (no conflict) + validators pass → `auto-merge`
- Generated files (conflict) → `review` (label: `conflict`)
- HISTORY.md change → `auto_delayed:4h`
- CONVENTIONS / GLOSSARY / UI / ML / MOBILE changes → `auto_delayed:24h`
- Critical files (AGENTS / ARCHITECTURE / OPS / SECURITY-NOTES / DECISIONS / INFRA) → `review`

If nothing changed: exit silently, no PR.

---

## Step 8 — Sweep tombstones

```bash
bash scripts/llm-docs/validate.sh --sweep-tombstones
```

For every `<!-- REMOVED YYYY-MM-DD: ... -->` comment in any doc file:
- If date ≥ 30 days ago: append to `.agents/REMOVALS.md` and remove from file

The REMOVALS.log entry preserves the permanent record even after the in-file tombstone is gone.

---

## Hard rules (must hold)

**Write protection:**
- All changes go through a PR opened by a bot account
- Hash check before overwriting any `generated` file
- AI never directly edits a `manual` file (only proposes via PR or SUGGESTIONS.md)
- AI never touches `generated` files directly (only via generator)

**Output protection:**
- HISTORY.md append-only, max 3 bullets per day
- Research max 3 items per scout per run, 20 for researcher
- Librarian only moves / archives / tombstones; never deletes outright
- Every AI step must emit `NO_UPDATE_NEEDED` if nothing material changed

**Audit:**
- Every PR includes rationale in description
- Tombstones older than 30 days swept to `.agents/REMOVALS.md` (permanent record)
- `.agents/index.json` health surface tracks conflicts, errors, stale files

---

## Failure modes

| Failure | Behavior |
|---|---|
| Generator script crashes | Skip that file; log in `health.validation_errors`; other generators continue |
| Scout API rate-limited | Skip; log; retry next scheduled run |
| Researcher hits token budget | Process priority items only; log skipped items in DISCOVERY_LOG |
| Librarian dedup detects N>50 duplicates | Flag for manual review; do not auto-merge |
| AI history pass returns malformed output | Skip HISTORY update; log to SUGGESTIONS.md |
| `.agents/index.json` parse fails | Halt entire pass; alert via Sentry or repo issue |

---

## See also

- Spec: <https://github.com/intrepideai/docent#readme>
- Top-level index: [`AGENTS.md`](../../AGENTS.md)
- Anchor: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- Research config: [`research/config.yml`](../../research/config.yml)
