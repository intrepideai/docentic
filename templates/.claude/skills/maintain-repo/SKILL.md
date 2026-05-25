---
name: maintain-repo
description: Run a maintenance pass on this repo — refresh generated docs, run validators, do a research pipeline pass, update HISTORY.md. Use when the user (or an external orchestrator) says "update the repo," "refresh the docs," "run maintenance," or similar.
---

# maintain-repo (Claude Code wrapper)

> **You were pointed here as an entry point.** Read this file, then go to the vendor-neutral spec at [`scripts/llm-docs/MAINTAIN.md`](../../../scripts/llm-docs/MAINTAIN.md) and execute it.
>
> **This file is intentionally thin.** It only exists so Claude Code can advertise the skill via its skill registry. The actual instructions live in MAINTAIN.md so non-Claude agents follow the exact same playbook.

## Trigger model

You'll typically arrive here because an external orchestrator (managed outside this repo) pointed an agent at this skill with a prompt like:

> "Go to `<repo>` and run the maintain-repo skill. Keep everything up to date. Commit and open a PR when done."

No GitHub Action runs the AI steps. **You are the orchestrator.** Read [`MAINTAIN.md`](../../../scripts/llm-docs/MAINTAIN.md) and follow the 8 steps.

## What it does

Reads and executes the 8-step pass in [`scripts/llm-docs/MAINTAIN.md`](../../../scripts/llm-docs/MAINTAIN.md):

```
1. Read state         (validate.sh --read-only)
2. Run generators     (gen-*.sh, with conflict check)
3. Run validators     (validate.sh)
4. Research pass      (scouts → researcher → librarian)
5. AI HISTORY pass    (with NO_UPDATE_NEEDED exit)
6. Update index       (.agents/index.json)
7. Open PR or no-op
8. Sweep tombstones
```

## How to invoke

1. **Read** [`scripts/llm-docs/MAINTAIN.md`](../../../scripts/llm-docs/MAINTAIN.md) for the full spec.
2. **Read** [`research/config.yml`](../../../research/config.yml) for topics/sources/cadence.
3. **Read** [`.agents/index.json`](../../../.agents/index.json) for current file state.
4. Execute steps 1-8 following the rules in MAINTAIN.md. Spawn parallel sub-agents for scouts using the prompts at [`scripts/llm-docs/prompts/scouts/`](../../../scripts/llm-docs/prompts/scouts/).
5. Use the researcher prompt at [`scripts/llm-docs/prompts/researcher.md`](../../../scripts/llm-docs/prompts/researcher.md).
6. Use the librarian prompt at [`scripts/llm-docs/prompts/librarian.md`](../../../scripts/llm-docs/prompts/librarian.md).
7. For HISTORY.md, use [`scripts/llm-docs/prompts/history.md`](../../../scripts/llm-docs/prompts/history.md).
8. Open a single PR with all changes, labeled `llm-docs`.

## Critical hard rules (do not break)

- **Hash-check before overwriting any generated file.** If a human edited it, STOP and open a conflict PR instead.
- **Never directly edit a `manual` file.** Append suggestions to `research/_meta/SUGGESTIONS.md`.
- **Every AI step must emit `NO_UPDATE_NEEDED`** if nothing material changed.
- **Append-only HISTORY.md**, max 3 bullets/day.
- **Researcher cap: 20 items/run.** Scouts cap: 3 items each/run.
- **Librarian only moves/archives.** Never deletes.
- **All changes through a PR.** Never write directly to main.

## Failure modes — exit cleanly

| Failure | Behavior |
|---|---|
| Generator script crashes | Skip that file; log; continue with others |
| Scout API rate-limited | Skip; log; retry next scheduled run |
| Token budget approaching | Process priority items only; log skipped |
| `.agents/index.json` parse fails | Halt; alert via issue creation |
| Filesystem permission error | Halt; alert |

## What gets reviewed by a human vs auto-merged

Default merge policies in [`.agents/index.json`](../../../.agents/index.json):

- **Critical files** (AGENTS, ARCHITECTURE, OPS, SECURITY-NOTES, DECISIONS, INFRA) → always `review`
- **Generated files** (no conflict) → `auto`
- **Generated files** (conflict detected) → `review`
- **AI-owned HISTORY.md** → `auto_delayed:4h`
- **Standard manual** (CONVENTIONS, GLOSSARY, UI, ML, MOBILE) → `auto_delayed:24h`

## When NOT to invoke this

- During active development (run after work, not during) — this is a maintenance pass, not an authoring tool
- When you're trying to make a specific architectural change — open a normal PR for that
- When you're trying to add new docs content — write it directly; let the next maintenance pass pick up the hash

## See also

- [`scripts/llm-docs/MAINTAIN.md`](../../../scripts/llm-docs/MAINTAIN.md) — full vendor-neutral spec
- [`AGENTS.md`](../../../AGENTS.md) — repo root index
- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) — system anchor
- <https://github.com/intrepideai/docent> — the design spec and full project README
