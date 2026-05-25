# Changelog

All notable changes to `docent` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at v1.0.

## [Unreleased]

### Added
- `prompts/conflict-resolver.md` — the 3rd public-facing orchestrator prompt. Handles hash conflicts on generated files (3-way diff + classification: clarification / out-of-scope / fundamental). Opus-class recommended.

### Fixed (pre-launch genericization)
- **Genericized `gen-map.sh`** — replaced ~20 pilot-specific directory annotations with ~15 universal ones covering common conventions (`apps/`, `packages/`, `scripts/`, `docs/`, `.github/`, `prisma/`, `terraform/`, etc.).
- **Genericized `gen-stack.sh`, `gen-integrations.sh`, `gen-data.sh`, `gen-api.sh`** — removed hardcoded paths from the initial pilot. Each generator now auto-detects its primary file location (root → `apps/*/` → `packages/*/` fallbacks).
- **Removed dep-as-legacy special casing** in `gen-stack.sh` and `gen-integrations.sh`. All deps treated equally. Added Drizzle, Stripe, OpenAI, Anthropic SDK detection.
- **Genericized example output** in `prompts/history.md` (now uses an "Email backend swap" sample).
- **Removed pilot-specific "Patterns" section** in `gen-api.sh` output. Now defers to the Bootstrap agent to fill in code-specific patterns from inspection.
- **`npx github:intrepideai/docent ...` works**: added `prepare` npm script that compiles TypeScript on git installs.
- New CI smoke test installs the package from a sibling directory and verifies the binary works.

### Changed
- All contact emails route to `clyde@intrepide.ai` (was: `conduct@`, `security@`, `hello@`, `noreply@` for various surfaces).

### Added
- `docent populate` command — fills scaffolded TODOs in `AGENTS.md` and `docs/*.md` using Claude (Anthropic API). Reads `ANTHROPIC_API_KEY` from `.env` or env. Supports `--model`, `--max-cost`, `--no-pr`, `--no-commit`, `--branch`, `--dry-run`. Uses tool_use for structured edits — robust JSON output, no fragile parsing. ~$0.30 per repo with Sonnet.
- `action.yml` at repo root — `intrepideai/docent` is now usable as a GitHub Action (`uses: intrepideai/docent@main`). Inputs: `path`, `warnings-as-errors`, `json`, `node-version`, `version`. Output: `ok`.
- `.github/workflows/example-docent-check.yml` — reference workflow showing how downstream repos invoke the action.
- `src/lib/anthropic.ts` — minimal fetch-based Anthropic client (no SDK dep). Messages API + tool_use + cost estimation.
- `src/lib/repo-context.ts` — gathers repo context (tree, manifest, README, recent commits, schemas, route files) for the populate prompt.
- README restructure: anatomy SVG moved up directly under the hero pitch; quick-start expanded from "Two ways" to "Three ways" (terminal · LLM chat · editor) plus a "Bonus — full auto with an API key" tier.
- `docent install` command — installs the docent skill into Claude Code and/or Cursor. Auto-detects which agents are installed; supports `--claude` / `--cursor` / `--project <path>` / `--force` / `--dry-run`.
- `skills/claude/SKILL.md` — Claude Code skill invocable as "docent this repo" / "make this repo agent-friendly"
- `skills/cursor/docent.mdc` — Cursor rule with same triggers
- `skills/README.md` — install paths + how to add new agent targets (Codex, Aider, etc.)
- README "Use it in your editor" section explaining the install + chat invocation flow
- `docent check [path]` command — validates a scaffolded repo without writing. Exit codes: `0` healthy, `1` errors, `2` not a docent repo. Supports `--json` for tooling and `--warnings-as-errors` for strict CI mode.
- `schemas/agents-index.schema.json` — JSON Schema (draft 2020-12) for `.agents/index.json`. Enables IDE autocomplete/validation in VS Code, Cursor, etc.
- `$schema` field auto-added to scaffolded `.agents/index.json` (points at the GitHub raw URL).
- README: "Use it in CI" section with copy-paste GitHub Actions workflow snippet.
- README: "Schemas (for tools and IDEs)" section.
- `LICENSE` (Apache 2.0), `NOTICE`
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
- `.github/ISSUE_TEMPLATE/` (bug, feature, question) and `pull_request_template.md`
- `CHANGELOG.md` (this file)

### Changed
- `package.json` license field: `UNLICENSED` → `Apache-2.0`
- `package.json` removed `"private": true` in prep for npm publish
- `package.json` `files` array: added `skills` and `schemas` so they ship in the published artifact
- README: removed obsolete demo.tape note (the anatomy SVG carries the visual now)

### Removed
- `docs/assets/demo.tape` — no longer needed (no GIF in the README)

## [0.1.0] — 2026-05-24

### Added
- Initial public-readiness scaffold of the `docent` CLI
- `docent init [path]` command with `--dry-run`, `--force`, `--minimal`, `--no-pr`, `--no-commit`, `--branch <name>`
- Stack detection: language, framework, database, frontend, infra, ML, mobile signals
- Templates: 57 files covering AGENTS.md, docs/* spine (13 files), `.agents/`, `.claude/skills/`, `scripts/llm-docs/`, `research/`
- Auto-detected docs: `docs/UI.md`, `INFRA.md`, `ML.md`, `MOBILE.md` based on stack
- Hand-coded hub-and-spoke logo (light + dark via `<picture>` + `prefers-color-scheme`)
- Hand-coded anatomy SVG showing the full scaffolded spine
- `prompts/bootstrap.md` — manual content-fill prompt for any LLM
- `prompts/config-seeder.md` — propose tailored `research/config.yml`
- `.env.example` — env vars for the planned `docent populate` command
- CI: typecheck + two smoke tests (dry-run, full scaffold)
- README with dual copy-paste hero (terminal + LLM prompt), comparison table, Mermaid spine diagram, "agent-friendly" badge for downstream repos

[Unreleased]: https://github.com/intrepideai/docent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/intrepideai/docent/releases/tag/v0.1.0
