# Changelog

All notable changes to `docentic` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at v1.0.

> **Note on naming.** Versions `0.1.x` shipped as `docent` / `@intrepideai/docent`. From `0.2.0` onward the binary, npm package, and GitHub repos are `docentic` / `@intrepideai/docentic`. Same tool, same scaffold — just disambiguated from other tools that already use the bare "docent" name. The `0.1.x` entries below describe the older binary name as it shipped (history isn't rewritten); see the `[0.2.0]` section for the rename details.

## [Unreleased]

## [0.3.0] — 2026-06-06

Stack-agnostic generators and multi-provider content-fill. docentic's
deterministic doc generators now produce real content for Python, Go, Ruby, and
PHP (not just JS/TS), and `populate` works with OpenAI and Gemini as well as
Anthropic. Includes the 0.2.3 safety/contract hardening.

### Added
- **Stack-agnostic generators via a `lang/<LANGUAGE>.sh` adapter seam.** The deterministic generators (`gen-stack`/`gen-api`/`gen-data`/`gen-integrations`) now produce real content for non-JS repos instead of blank/wrong skeletons, dispatching to a per-language adapter; the JS/TS paths are untouched.
  - **Python** (`lang/python.sh`) — `pyproject.toml`/`requirements.txt` stack; FastAPI/Flask decorator routes + Django URLConf (incl. `re_path(r"…")`); SQLAlchemy/Django models; `os.environ`/`os.getenv` env vars; Python services.
  - **Go** (`lang/go.sh`) — `go.mod` module/version/deps; gin/chi/echo verbs + net/http·gorilla `HandleFunc` (multiple routes per line); GORM models; `os.Getenv`/`os.LookupEnv`; Go services.
  - **Ruby / Rails** (`lang/ruby.sh`) — `Gemfile`/`.ruby-version`; `config/routes.rb` verbs + `resources`/`resource` (plural vs singular); ActiveRecord models; `ENV[...]`/`ENV.fetch`; Ruby services.
  - **PHP / Laravel** (`lang/php.sh`) — `composer.json` (`require` only); `Route::get/…` + `Route::resource`/`apiResource`; Eloquent models; `env()`/`getenv()`/`$_ENV[]`; PHP services.
- **Multi-provider `populate`** — real OpenAI and Google Gemini support alongside Anthropic, behind a small provider abstraction (`src/lib/llm/`). The provider is chosen by `DOCENT_PROVIDER`, else the first key present (`ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → `GEMINI_API_KEY`). OpenAI uses Chat Completions + function calling (honors `OPENAI_MODEL` / `OPENAI_BASE_URL`); Gemini uses `generateContent` + function calling (honors `GEMINI_MODEL`). Covered by mocked-transport unit tests for all three.
- **Polyglot detection foundation.** `detect-stack.sh` exports a primary `LANGUAGE` (`js-ts` · `python` · `go` · `rust` · `ruby` · `php` · `java` · `unknown`) and the resolved `MANIFEST` path, and picks a language-appropriate `PACKAGE_MANAGER` (pip/poetry/uv/pipenv · go · cargo · bundler · composer · maven/gradle) instead of defaulting everything to `npm`. `SRC_DIRS` is now language-aware (includes `lib/` for JS, and `cmd/`/`internal/`/`pkg/`/… for non-JS). The TS detector also gains Go web-framework (`gin`/`echo`/`chi`/`fiber`) and DB (`gorm`/`ent`/`pgx`/`sqlx`) detection.

### Changed
- **Honest, layered scope copy.** README tagline + body now state the real scope: scaffold/detection/LLM-fill on any repo; deterministic generators for JS/TS, Python, Go, Ruby, and PHP. Corrected the stale "two smoke tests" CI claim, the GLOSSARY spine count (12 core docs in `docs/` + root `AGENTS.md`, not "13 in docs/"), and the PR label mismatch (`init` now uses the `docentic` label, matching `populate` and the maintenance loop).
- `.agents/index.json` `template_version` is now stamped with docentic's real version (was hardcoded `0.1.0`).
- `init`'s "next steps" points at the real maintenance entry point (`scripts/llm-docs/MAINTAIN.md`) instead of "7 prompts (see prompts/)"; `MAINTAIN.md` Step 3 no longer hardcodes docentic's own `apps/docs/` layout.
- `install --project` now warns it's Cursor-only instead of silently ignoring it for Claude.
- `populate` cost estimates are now **per-model** (`src/lib/pricing.ts`) instead of always Sonnet-priced, and `--max-cost` / `DOCENT_MAX_COST_USD` gate against the right figure (a non-numeric env value is ignored rather than disabling the guard).
- `.env.example` rewritten to reflect what the code actually reads (real providers, valid model ids, `DOCENT_PROVIDER`, `DOCENT_MODEL_BOOTSTRAP`, `DOCENT_MAX_COST_USD`) and drops the false "coming soon — scaffold-only" note and the dead env vars.

### Fixed
- `populate` now **refuses to apply a truncated response** (`stop_reason`/`finish_reason` = max tokens) instead of writing partial/garbled file content, and validates the structured tool output rather than blindly casting it.
- Generators no longer write **confidently-wrong content** into the "source of truth" docs: dependencies/services named only in a comment are no longer reported as active, commented-out routes/models are skipped, and multiple route registrations on one line are all captured (not collapsed into a fabricated endpoint).
- `gen-stack` falls back to the lockfile-derived package manager when package.json's corepack `.packageManager` field is absent (no more blank row for plain npm/pnpm/yarn/bun repos); `gen-integrations` links the detected manifest as source-of-truth only when it exists (no dead `package.json` link on non-Node repos).
- `*.xcodeproj` detection in the stack detector was dead code (`existsSync` doesn't expand globs); it now matches real directory entries by suffix.
- `populate`'s context-gatherer no longer skips nested monorepo schemas — the `apps/*/prisma/schema.prisma` glob is actually expanded (it was previously `continue`-d past), Drizzle default layouts are gathered, and monorepo app manifests (`apps/*/package.json`) are included so the LLM sees real app dependencies.

## [0.2.3] — 2026-06-05

Safety, git-correctness, and contract-hardening release. No behavior change on
the happy path; closes a secret-leak, a shell-injection vector, and a class of
self-inflicted `docentic check` failures.

### Security
- **`docentic populate` can no longer commit your `.env` (live API key).** `init` now adds `.env` (and `.env.local`, `.env.*.local`) to `.gitignore`, and both `init` and `populate` stage only the files they actually wrote instead of `git add -A` — so an un-ignored secret can never be swept into the scaffold commit.
- **Shell-injection / quoting bugs removed from all git + gh helpers.** Every invocation now uses `execFileSync` with an argv array; a value like `--branch 'x$(rm -rf .)'` is passed as one literal argument and never reaches a shell.

### Fixed
- **`--minimal` and `--spine-only` no longer fail `docentic check`.** `.agents/index.json` now lists only the docs the chosen mode actually scaffolds, and `check` derives its required-file set from the index (plus a tiny hard core: `AGENTS.md`, `docs/ARCHITECTURE.md`) instead of a hardcoded list of 13.
- **`docentic check` no longer double-reports a missing file** or emits malformed `docs[].<path>` error keys.
- **`validate-index.ts` is now at parity with the published JSON schema** — it rejects unknown top-level/`docs[]` keys (`additionalProperties: false`) and validates `template_version` as semver, so `check` no longer green-lights index files that `ajv` would reject.
- **No more crash on an unborn repo.** Running `docentic init` right after `git init` (no commits yet) used to abort with `fatal: ambiguous argument 'HEAD'`; it now creates the first commit cleanly.
- **Gitignore conflicts are a true pre-flight.** When a scaffolded path would be `.gitignore`d, `init` now writes *nothing* (previously it wrote ~53 of 54 files and then reported "these were NOT written").
- **Failed runs no longer strand the repo on an empty `docentic/template-scaffold` branch** — the branch is created only at commit time.
- **PRs target the repo's real default branch.** `gh pr create` no longer hardcodes `--base main`, so it works on `master`/`develop`/`trunk` repos; the branch-creation message reports the actual base instead of always saying "main".
- **The default `populate` model is actually `claude-sonnet-4-6` now** in code (`populate.ts` + `cli.ts`), not just in the README — the `0.2.2` changelog claimed this fix but it had only been applied to the docs.

### Added
- **Real `npm test`.** Added a `node:test` CLI integration suite (`test/cli.test.js`) covering every fix above; `npm test` previously matched zero files and exited green. Wired into CI.
- Centralized model IDs in `src/lib/models.ts` so the documented default can't drift from the code default again.

## [0.2.2] — 2026-06-02

Makes the `scripts/llm-docs/` generators stack-agnostic across the JS/TS
ecosystem. They previously assumed a Next.js + Prisma + pnpm monorepo and
crashed or produced wrong output on anything else (an Express + Drizzle + Vite
single-package repo, for example).

### Added
- **Stack auto-detection** (`detect-stack.sh`, sourced by every generator): detects Next.js (monorepo/single), Express, Fastify, and Hono; Prisma vs. Drizzle; npm/pnpm/yarn/bun; and the API-route and schema-file locations.
- **Express, Fastify, and Hono** endpoint extraction in `gen-api.sh`.
- **Drizzle** schema support in `gen-data.sh` (alongside Prisma), plus a no-ORM placeholder with a raw-migrations fallback.
- Broader dependency detection in `gen-stack.sh` / `gen-integrations.sh` (Express, Vite, Fastify, Hono, TanStack Query, Passport, bcryptjs, express-session, Resend, googleapis, Octokit, SendGrid, `@sentry/node`, …).
- Dynamic `gen-map.sh` sections for single-package repos (`server/`, `client/`, `shared/`, `drizzle/`) instead of a hardcoded `apps/docs/` + `packages/` layout.
- A 93-assertion shell test suite (`test/shell-scripts.sh`) wired into CI on both the grep-fallback and ripgrep code paths, plus an end-to-end generator run after `init`.

### Fixed
- `docentic init` now scaffolds `detect-stack.sh`. Without it, every generator failed at startup (`source: No such file or directory`) on a freshly scaffolded repo.
- `gen-api.sh` no longer truncates `API.md`: fixed a `sed` delimiter colliding with the route-method alternation (it aborted under `set -e`+`pipefail` on Fastify/Hono and on Express without ripgrep), an Express field-order bug that left methods lowercase, and aborts when no routes match the patterns.
- `detect-stack.sh` no longer aborts all generators on a Hono repo that has no `new Hono` match.

### Docs
- README accuracy fixes: "any codebase" → "any JS/TS codebase", a broken Quick-start nav anchor, "regenerated daily" → "auto-regenerated", and an invalid default model id (`claude-sonnet-4-7` → `claude-sonnet-4-6`).

## [0.2.1] — 2026-05-25

Marketplace prep release. Tweaks to the GitHub Action so its listing looks
sharper on the Marketplace tile, plus a new output for downstream automation.

### Added
- **`check-summary` output** on the GitHub Action — a one-line string like `errors=2 warnings=1 spine_missing=0`. Captured by always running `docentic check --json` first (cached npx, near-free), parsed with jq with a Node fallback for self-hosted runners. Pipe it into a PR comment or Slack message:
  ```yaml
  - id: docentic
    uses: intrepideai/docentic@main
    continue-on-error: true
  - if: steps.docentic.outputs.ok == 'false'
    run: echo "🟣 ${{ steps.docentic.outputs.check-summary }}"
  ```
  The action also emits a `::notice::` annotation with the same summary so it shows up at the top of the Actions log without any extra wiring.
- **Marketplace badge** in the README badge strip.

### Changed
- **Tightened the GitHub Action description.** From `Validate that a repo follows the docentic agent-friendly template — runs `docentic check` against your codebase.` to `Validate the agent-friendly docs spine in any repo. Fail PRs that break AGENTS.md / docs/ / .agents/index.json.` — better fit for the Marketplace tile preview.

## [0.2.0] — 2026-05-25

The rebrand release: `docent` → `docentic`.

Same code, same scaffold, same CLI surface — only the package name, binary
name, GitHub repo, and a handful of branding strings change. v0.1.1 was
published to npm under `@intrepideai/docent` for ~1 hour with only internal
use; that package is now deprecated and points users at the new one.

### Changed
- **Package name:** `@intrepideai/docent` → `@intrepideai/docentic`.
- **Binary name:** `docent` → `docentic`. `docent init` becomes `docentic init`, `docent populate` → `docentic populate`, etc.
- **GitHub repos:** `intrepideai/docent` → `intrepideai/docentic` (and the internal mirror). GitHub auto-redirects old URLs for the foreseeable future, but new references should use the new names.
- **Default branch names** created by `init` / `populate`: `docent/template-scaffold` → `docentic/template-scaffold`, `docent/populate-content` → `docentic/populate-content`.
- **Skill install paths:** `~/.claude/skills/docent/` → `~/.claude/skills/docentic/`, `~/.cursor/rules/docent.mdc` → `~/.cursor/rules/docentic.mdc`. Reinstall via `docentic install --claude --cursor` (the old install paths are not auto-cleaned).
- **GitHub Action:** `uses: intrepideai/docent@main` → `uses: intrepideai/docentic@main`.
- **JSON Schema URL:** the `$schema` field in scaffolded `.agents/index.json` now points at `https://raw.githubusercontent.com/intrepideai/docentic/main/schemas/agents-index.schema.json`.
- **Cursor rule filename** in this repo: `skills/cursor/docent.mdc` → `skills/cursor/docentic.mdc`.

### Why the rename
"Docent" is already a tool name in the AI/ML space (Transluce's interpretability platform). The bare name was creating discoverability and disambiguation friction. `docentic` is the adjective form — "in the manner of a docent" — and preserves the museum-guide metaphor (a docent guides visitors; `docentic` does the same for your repo) without colliding.

### Migration
- **npm:** `npm uninstall @intrepideai/docent && npm install @intrepideai/docentic` (or `npm install -g @intrepideai/docentic` for global). The old package is deprecated with a redirect message.
- **GitHub Action:** swap `uses: intrepideai/docent@main` for `uses: intrepideai/docentic@main`.
- **Existing scaffolded repos:** nothing required. Generated files don't carry the binary name. Re-running `docentic init --force` will refresh the scaffold with `docentic`-branded templates if you want to update copy.

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

[Unreleased]: https://github.com/intrepideai/docentic/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/intrepideai/docentic/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/intrepideai/docentic/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/intrepideai/docentic/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/intrepideai/docentic/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/intrepideai/docentic/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/intrepideai/docentic/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/intrepideai/docentic/releases/tag/v0.1.0
