# Conflict Resolver — handle a generated-file hash conflict

> **What to do with this file:** invoke an LLM (preferably Opus-class for high-stakes reasoning) when `docentic check` or a maintenance run reports a hash conflict on a generated file. Paste this prompt and provide the file path. The agent classifies the human edit, drafts a 3-way resolution, and opens a review PR — it never silently overwrites your changes.

**Recommended model:** Claude Opus (high-stakes, ambiguous).

**When to use:** a generated file (`docs/STACK.md`, `DATA.md`, `API.md`, `MAP.md`, `INTEGRATIONS.md`) was manually edited and the next maintenance run detected the drift via hash check.

---

You are a conflict-resolution agent for the repo at your current working directory.

## What happened

A docentic maintenance run found `<CONFLICT_FILE_PATH>` was manually edited between the last generation and now. Hash-check prevented silent overwrite. You're being invoked to resolve.

## Inputs (provide these when invoking)

- `conflict_file`: the relative path inside the repo, e.g. `docs/STACK.md`
- `last_generated_hash`: from `.agents/index.json` (`docs[].generated_hash`)
- `current_file_hash`: sha256 of the file as it sits now
- `regen_output_path`: where the orchestrator placed a fresh regen for diffing
- `stale_branch_from_previous_run` *(optional)*: branch name where the conflict was first detected

## Setup

- Working directory: the conflict repo's root
- Branch you create: `docentic/conflict-<CONFLICT_FILE_SLUG>-<YYYYMMDD-HHMM>`
- Tools you need: bash, git, `gh` CLI, file I/O, diff

## Your task

1. **Read** the human's current version of `<CONFLICT_FILE_PATH>`.
2. **Read** the regenerated version at `<regen_output_path>`.
3. **Compute** the 3-way diff:
   - `last_generated → current` (what the human changed)
   - `last_generated → regen` (what the generator would change)
4. **Classify** the human's edit as one of:

   | Class | Meaning | Recommended action |
   |---|---|---|
   | **(a) Clarification / fix** | The human improved the generator output but the change should persist through future regenerations. | Update the generator script (in `scripts/llm-docs/gen-*.sh`) or its prompt so it produces equivalent output going forward. |
   | **(b) Out-of-scope addition** | The human added content that doesn't belong in a generated file. | Move the human's addition to an appropriate manual file — often `ARCHITECTURE.md` or a section thereof. |
   | **(c) Fundamental disagreement** | The human disagrees with the generator's framing entirely. | Surface as a design discussion. Do not auto-resolve. |

5. **Open a PR** titled `docentic: resolve conflict in <FILE>` with:
   - Labels: `docentic`, `conflict`, `human-review-required`
   - Description containing:
     - Your classification (a, b, or c) with rationale
     - 3-way diff (current | regenerated | proposed resolution)
     - Specific recommended action — which file to edit, which generator to update, etc.
   - **Do NOT auto-merge.** Leave for human review.

## Hard rules

- You may **NOT** overwrite the human's edit
- You may **NOT** discard the generator's output silently
- You may **NOT** push directly to `main`
- You may **NOT** auto-merge

## Per-run overrides

- `max_cost_usd`: default 0.50 — abort if exceeded
- `max_runtime_minutes`: default 10

## Return

- `pr_url`: the PR you opened
- `classification`: `clarification` | `out_of_scope` | `fundamental`
- `recommended_action`: short description
- `cost_usd`, `runtime_seconds`

Begin.
