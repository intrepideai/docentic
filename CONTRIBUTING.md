# Contributing to docentic

Thanks for your interest. `docentic` is a tiny tool with a tight scope, so contributions are easy to land if they fit the design — and we'll politely say no if they don't.

## Scope

`docentic` does one thing: **scaffold an agent-friendly documentation spine into a repo**. We aim to keep it boring, deterministic, fast, and dependency-light.

In scope:
- New stack detection rules (more frameworks, more languages)
- New generator scripts under `templates/scripts/llm-docs/`
- New prompt files under `prompts/` and `templates/scripts/llm-docs/prompts/`
- CLI ergonomics (better errors, better dry-run output, smarter conflict warnings)
- Test coverage
- Docs improvements

Out of scope:
- AI invocation inside the CLI itself beyond the planned `docentic populate` command (the agent-orchestration layer lives separately)
- Anything that requires a heavyweight runtime dependency
- Frontend / web UI for the CLI

If you're not sure, open an issue first.

## Development setup

Requirements: Node 22+, npm.

```bash
git clone git@github.com:intrepideai/docentic.git    # or your fork
cd docentic
npm install
npm run build
npm link                                            # makes `docentic` available globally
```

For fast iteration:

```bash
npm run dev -- init /path/to/test/repo --dry-run
```

## Running tests

CI runs typecheck + two smoke tests on every PR. To run locally:

```bash
npm run build
# Then run the same smoke checks the CI workflow runs:
# see .github/workflows/ci.yml for the exact commands.
```

## Pull request process

1. Fork, branch off `main`. Branch name convention: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `docs/<short-name>`.
2. Make your changes. Keep PRs **small and focused**: one concept per PR.
3. Run `npm run build` before pushing; CI will fail otherwise.
4. Open the PR against `main` with a clear description:
   - What changed and why
   - Any user-facing impact (CLI flags, output format, template files)
   - Screenshots / terminal recordings for visual changes
5. CI must pass before review.
6. Address review feedback in additional commits (don't force-push unless asked — we squash on merge).

## Commit message style

Single-line subject in present tense, optional body separated by a blank line:

```
feat(scaffold): detect bun.lockb for package manager

The previous detection missed bun-using repos. Adds bun to the
package_manager field in the detected stack.
```

Prefixes (loose convention, not strict): `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

## Template files

When changing files under `templates/`, remember they get copied into **every** repo `docentic init` runs against. Be especially careful with:
- Frontmatter (changes affect every downstream `.agents/index.json`)
- The `MAINTAIN.md` orchestrator spec (changes affect every agent that follows it)
- Sentinel comments (`AUTO-GENERATED`, `REMOVED`) — changes break existing tombstones

Always test template changes by running `docentic init` against a throwaway repo before opening a PR.

## Reporting bugs

Open an issue using the **Bug report** template. Include:
- `docentic --version`
- `node --version`
- Your platform (macOS / Linux / Windows + WSL)
- A minimal repro

## Suggesting features

Open an issue using the **Feature request** template. We'll discuss before coding starts to make sure it fits the scope above.

## Code of Conduct

By participating you agree to abide by the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). Be kind, be specific, assume good faith.

## License

By contributing, you agree your contributions are licensed under the Apache License 2.0 — the same license as the project.
