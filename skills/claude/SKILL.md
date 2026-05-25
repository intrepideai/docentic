---
name: docent
description: Make a repo agent-friendly. Use when the user says "docent this repo", "scaffold docent", "make this repo agent-friendly", "give this repo AGENTS.md", or similar — anything about adding standardized agent-readable documentation to a codebase. Scaffolds AGENTS.md + a docs/ spine + research pipeline + maintain-repo skill.
---

# docent

> Your agent guide through any codebase. <https://github.com/intrepideai/docent>

When invoked, you scaffold the [docent](https://github.com/intrepideai/docent) template into a repo and optionally fill in the content TODOs.

## Triggers

- "Docent this repo"
- "Make this repo agent-friendly"
- "Scaffold docent"
- "Give this repo AGENTS.md and docs"
- "Add the docent template here"
- Any variant of the above

## What you'll do

### Step 1 — Confirm the target

Default to the current working directory. If unclear, ask the user briefly: "Scaffold docent into `<cwd>`?" — wait for confirmation if the directory looks suspicious (e.g. they're in their home directory rather than a repo).

### Step 2 — Run the scaffold

```bash
cd <target-repo>
npx -y github:intrepideai/docent init
```

This commits a `docent/template-scaffold` branch and (if `gh` CLI is configured) opens a PR. ~50 files are created: `AGENTS.md` at root, the `docs/` spine, `.agents/`, `.claude/skills/maintain-repo/`, `scripts/llm-docs/`, `research/`.

Stack detection runs automatically — `UI.md` / `INFRA.md` / `ML.md` / `MOBILE.md` are added when the stack matches.

### Step 3 — Offer to fill the TODOs

The scaffold leaves TODO markers in `AGENTS.md` and `docs/*.md` because real content depends on the codebase. Ask the user:

> "Scaffold done. Want me to fill in the AGENTS.md and docs/* TODOs now? I'll read the codebase and open a follow-up PR."

If yes:
1. Read [`prompts/bootstrap.md`](https://github.com/intrepideai/docent/blob/main/prompts/bootstrap.md) from the docent repo
2. Follow it exactly — read the codebase (README, package manifest, top-level tree, recent git log, schema files, route handlers, CI config), fill every TODO with real content
3. Commit on a `docent/populate-content` branch and open a PR

### Step 4 — Offer config seeding

After content is filled:

> "Want me to also propose research topics for `research/config.yml`? It tailors the daily research pipeline to this codebase."

If yes:
1. Read [`prompts/config-seeder.md`](https://github.com/intrepideai/docent/blob/main/prompts/config-seeder.md)
2. Follow it — write `research/config.proposed.yml` with topics/keywords/sources tailored to the codebase
3. Open a PR for human review (do NOT overwrite `research/config.yml`)

### Step 5 — Stop

Don't keep going. The maintenance loop is a separate concern handled by the `maintain-repo` skill that `docent init` scaffolds into the repo.

## Hard rules

- **Never** modify generated files (`docs/STACK.md`, `DATA.md`, `API.md`, `MAP.md`, `INTEGRATIONS.md`) — they're owned by `scripts/llm-docs/gen-*.sh`
- **Never** edit `scripts/llm-docs/` or `research/` infrastructure
- **Never** auto-merge any PRs you open — humans review
- **Never** scaffold without confirming the target if the cwd looks like the wrong place
- **Don't continue** into maintenance / research / HISTORY work — that's a separate skill

## Failure modes

| Problem | Behavior |
|---|---|
| Target is not a git repo | Tell the user to `git init` first, then re-invoke |
| `AGENTS.md` already exists | The CLI exits cleanly; report "already scaffolded" and skip to step 3 if user wants to repopulate |
| `npx` fails (network, install error) | Surface the error verbatim; suggest cloning + npm-link as fallback |
| `gh` not configured | Scaffold still runs and commits the branch; report that the PR wasn't auto-opened |

## More

- Spec: <https://github.com/intrepideai/docent#readme>
- Bootstrap prompt: <https://github.com/intrepideai/docent/blob/main/prompts/bootstrap.md>
- Config seeder: <https://github.com/intrepideai/docent/blob/main/prompts/config-seeder.md>
- Validate a scaffolded repo: `npx -y github:intrepideai/docent check`
