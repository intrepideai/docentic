# Prompts

LLM prompts that pair with the `docentic` CLI. Copy-paste into any agent (Claude, ChatGPT, Cursor, Codex, Gemini, etc.) when you want to drive a step manually instead of via the CLI.

## Three orchestrator-facing prompts at this level

| Prompt | When to use | Recommended model |
|---|---|---|
| [`bootstrap.md`](./bootstrap.md) | Once per repo, right after `docentic init` — fills in AGENTS.md + docs/* TODOs from reading the codebase | Opus-class |
| [`config-seeder.md`](./config-seeder.md) | Once per repo, after Bootstrap — proposes tailored `research/config.yml` topics | Sonnet-class |
| [`conflict-resolver.md`](./conflict-resolver.md) | When `docentic check` reports a hash conflict on a generated file | Opus-class |

## Per-task prompts (scaffolded into each repo)

When you run `docentic init`, the per-task prompts get scaffolded INTO your repo at `scripts/llm-docs/prompts/`:

- `scouts/*.md` — 10 source-specific scouts (x, github, arxiv, web, hf, reddit, hn, rss, lobsters, youtube) + a universal contract template
- `researcher.md` — deep-dive one queue item into a research file
- `librarian.md` — daily curation, 5-axis scoring, 6 surfaced views
- `history.md` — narrate yesterday's commits into bullets

These live in your repo (not here) because they're invoked by the daily maintenance loop your orchestrator runs against that specific repo.

## How to use these orchestrator-facing prompts

### Option A — paste into an LLM chat

1. Run `docentic init <repo>` (or whatever step prompted you to invoke this prompt)
2. Open the repo in your LLM of choice — Claude with filesystem MCP, ChatGPT with code interpreter, Cursor in agent mode, etc.
3. Copy the contents of the prompt (everything below its `---`)
4. Paste into the chat, fill in any `<PLACEHOLDERS>` (most prompts have a `<YOUR-REPO-PATH>` or similar)
5. Review the PR the agent opens

### Option B — agent harness with an API key

`docentic populate` reads `ANTHROPIC_API_KEY` from `.env` and runs the Bootstrap prompt automatically. See the top-level [README](../README.md) for setup.

## Adding more prompts

PRs welcome. The general shape:

- One markdown file per prompt
- Start with a short blockquote explaining when to use it
- Use `## Inputs` / `## Setup` / `## Your task` / `## Hard rules` / `## Return` sections
- Use `<PLACEHOLDERS>` for anything the user fills in at invocation time
- End the prompt body with `Begin.`
