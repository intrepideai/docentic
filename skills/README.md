# skills/

Installable skill files for AI coding agents. Each subdirectory targets one agent.

| Target | Path | Install location |
|---|---|---|
| **Claude Code** | [`claude/SKILL.md`](./claude/SKILL.md) | `~/.claude/skills/docentic/SKILL.md` |
| **Cursor** | [`cursor/docentic.mdc`](./cursor/docentic.mdc) | `~/.cursor/rules/docentic.mdc` (global) or `<project>/.cursor/rules/docentic.mdc` (per-project) |

## Install

Easiest way — let `docentic` do it for you:

```bash
npx -y @intrepideai/docentic install        # detect Claude + Cursor, install both
npx -y @intrepideai/docentic install --claude
npx -y @intrepideai/docentic install --cursor
npx -y @intrepideai/docentic install --cursor --project .   # per-project Cursor rule
```

Or copy the files manually:

```bash
# Claude Code
mkdir -p ~/.claude/skills/docentic
curl -fsSL https://raw.githubusercontent.com/intrepideai/docentic/main/skills/claude/SKILL.md \
  -o ~/.claude/skills/docentic/SKILL.md

# Cursor (global)
mkdir -p ~/.cursor/rules
curl -fsSL https://raw.githubusercontent.com/intrepideai/docentic/main/skills/cursor/docentic.mdc \
  -o ~/.cursor/rules/docentic.mdc
```

## What these skills do

Once installed, you can say things like:

- "docentic this repo"
- "make this repo agent-friendly"
- "scaffold docentic"
- "give this repo AGENTS.md and docs"

…and your agent runs `npx -y @intrepideai/docentic init`, then offers to fill in the content TODOs from the codebase.

## Adding a new target

We accept PRs adding skills for other agents (Codex CLI, Aider, Continue, Cline, Gemini CLI, Windsurf, …). Open an issue first to discuss the install path convention; then mirror the structure of `claude/` or `cursor/`.
