# Changelog

All notable changes to `docent` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at v1.0.

## [Unreleased]

## [0.1.1] — 2026-05-24

First post-launch hardening release driven by feedback from a real-world
install against a polyglot Laravel + Flutter + Terraform monorepo. The
common thread: be louder when the environment disagrees with our defaults,
and detect more of what's actually in the repo.

### Added
- `--spine-only` flag on `docent init` — scaffold only `AGENTS.md` + `docs/` + `.agents/`, skip the `research/` pipeline and `scripts/llm-docs/` tooling. Good fit for repos that want the agent-friendly doc spine but aren't ready to run the daily maintenance loop yet. Drops the scaffold from ~57 files to ~17.
- `--force-ignored` flag on `docent init` — scaffold files even when they would be dropped by `.gitignore`. Default behavior is now a hard-stop with the full list (was: silently let `git add` swallow them).
- Stack detection now walks 1-deep into common monorepo / polyglot layouts (`apps/*`, `packages/*`, `backend`, `frontend*`, `mobile*`, `infrastructure`, `api`, `server`, `web`, `client`, `app`) so non-Node stacks aren't missed when the root is Node-ish.
- Detection added for: PHP / Composer (Laravel, Symfony), Dart / Flutter (`pubspec.yaml`), Rust (`Cargo.toml`), Go (`go.mod`), Ruby (`Gemfile`), Java / Kotlin (Maven + Gradle Kotlin), Swift / Obj-C, Astro, SvelteKit, Nuxt, Solid, Hono, Drizzle, Supabase JS, conda environments, Docker Compose variants (`compose.yml`, `compose.yaml`), Kubernetes (`k8s/`, `kustomization.*`, `helm/`).
- `detectedIn` field on `DetectedStack` — surfaces which subdirs the detector actually inspected, so users can verify the auto-detected docs aren't running on a misread.
- `git.ts` helpers: `labelExists`, `createLabel`, `ensureLabel`, `filterIgnored`.
- README "Useful flags" table under the install section, and an explicit "agent with repo filesystem access" callout on the LLM-chat onboarding option (was ambiguous — stock ChatGPT / Claude.ai web can't actually run `npx`).
- CI matrix now tests on Node 20 + 22; new smoke tests cover the gitignore halt, `--force-ignored` override, `--spine-only` mode, and monorepo subdir detection.

### Fixed
- **`gh pr create --label llm-docs` no longer crashes** if the label doesn't exist on the repo. We now `ensureLabel` first (creating it if we can), and if creation fails (no write perms), we open the PR without the label rather than failing the whole flow.
- **`docent init` no longer silently scaffolds files into `.gitignore`.** Before scaffolding, we run `git check-ignore` over every planned target. If any would be ignored, we fail early with the full list and a fix-it suggestion. `--force-ignored` overrides.
- **Stack detection no longer locks onto the root `package.json`** and misses everything else. Polyglot repos with a Node tooling root but real code under `backend/` (Laravel), `mobile/` (Flutter), `infrastructure/` (Terraform), etc. are now detected end-to-end.

### Changed
- `engines.node` lowered from `>=22` to `>=20`. Node 22 is too new to be the minimum for a tool meant to drop into existing repos; Node 20 is LTS and ubiquitous.
- `docent init` prints the `detectedIn` subdir list and warns loudly if no languages were detected (so generic-scaffold-on-a-real-repo is no longer a silent surprise).
- Next-steps output now explicitly says `docent init` is safe to re-run for picking up template updates.
- `init` no longer logs as `llm-docs init` — now matches the binary name (`docent init`).

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

[Unreleased]: https://github.com/intrepideai/docent/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/intrepideai/docent/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/intrepideai/docent/releases/tag/v0.1.0
