# skills/

Installable skill files for AI coding agents. Each subdirectory targets one agent.

| Target | Path | Install location |
|---|---|---|
| **Claude Code** | [`claude/SKILL.md`](./claude/SKILL.md) | `~/.claude/skills/docent/SKILL.md` |
| **Cursor** | [`cursor/docent.mdc`](./cursor/docent.mdc) | `~/.cursor/rules/docent.mdc` (global) or `<project>/.cursor/rules/docent.mdc` (per-project) |

## Install

Easiest way — let `docent` do it for you:

```bash
npx -y github:intrepideai/docent install        # detect Claude + Cursor, install both
npx -y github:intrepideai/docent install --claude
npx -y github:intrepideai/docent install --cursor
npx -y github:intrepideai/docent install --cursor --project .   # per-project Cursor rule
```

Or copy the files manually:

```bash
# Claude Code
mkdir -p ~/.claude/skills/docent
curl -fsSL https://raw.githubusercontent.com/intrepideai/docent/main/skills/claude/SKILL.md \
  -o ~/.claude/skills/docent/SKILL.md

# Cursor (global)
mkdir -p ~/.cursor/rules
curl -fsSL https://raw.githubusercontent.com/intrepideai/docent/main/skills/cursor/docent.mdc \
  -o ~/.cursor/rules/docent.mdc
```

## What these skills do

Once installed, you can say things like:

- "docent this repo"
- "make this repo agent-friendly"
- "scaffold docent"
- "give this repo AGENTS.md and docs"

…and your agent runs `npx -y github:intrepideai/docent init`, then offers to fill in the content TODOs from the codebase.

## Adding a new target

We accept PRs adding skills for other agents (Codex CLI, Aider, Continue, Cline, Gemini CLI, Windsurf, …). Open an issue first to discuss the install path convention; then mirror the structure of `claude/` or `cursor/`.
