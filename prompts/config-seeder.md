# Config Seeder — propose research topics

> **What to do with this file:** copy everything below the `---` into your LLM of choice. It will read your codebase and propose a tailored `research/config.yml` for the docentic research pipeline.

**Recommended model:** Claude Sonnet (this is read + judgment; doesn't need the deepest reasoning).

**Pre-req:** run this AFTER the Bootstrap prompt (so ARCHITECTURE.md is filled in).

---

The repo at your current working directory has the `docentic` template installed. The research pipeline at `research/` is scaffolded but `research/config.yml` is a generic skeleton — it has no topics, keywords, or sources tailored to this codebase.

Your job: read the docs and propose a tailored config. Don't overwrite the existing `config.yml` — write to `research/config.proposed.yml` for human review.

## What to read

1. `AGENTS.md`
2. `docs/ARCHITECTURE.md` (this is the anchor — your richest source)
3. `docs/STACK.md` (or `package.json` / equivalent if STACK isn't generated yet)
4. `docs/CONVENTIONS.md`
5. `docs/DECISIONS.md`

## What to propose

Write a YAML file at `research/config.proposed.yml` matching the structure of `research/config.yml` but with these fields tailored:

### `topics:` (5-10 entries)
Specific concerns this repo cares about. Not generic categories — actual concepts.

Bad: `web-development`, `databases`
Good: `nextjs-15-app-router`, `prisma-mysql-migrations`, `multi-tenant-saas-patterns`

### `keywords:` (5-15 entries)
Free-text search strings the scouts will use. Mix specific tech and concept terms.

### `sources:`
- `x_handles`: 3-8 X accounts authoritative for this stack (e.g. `leeerob` for Next.js, `prisma` for Prisma)
- `github_topics`: 3-6 relevant GitHub topic tags
- `arxiv_categories`: leave empty `[]` for non-ML repos
- `web_domains`: ALLOWLISTED domains only (e.g. `nextjs.org`, `prisma.io`, `vercel.com`). Never invent random sites.
- `hf_interests`: leave empty `[]` for non-ML repos
- `reddit_subs`: 3-6 relevant subreddits (without `r/`)
- `rss_feeds`: 2-4 high-signal feeds (official blogs, well-known practitioners)
- `lobsters_tags`: relevant tags
- `youtube_channels`: usually empty unless conference-heavy domain

### Keep these unchanged
- `exclusions` (already a reasonable default)
- `cadence` (template default works)
- `filters` (template default works)
- `caps` (template default works)
- `priority_weights` (template default works)
- `auto_archive` (template default works)
- `schedule` (template default works)

## Quality bar

- Topics must map to real concerns visible in `docs/ARCHITECTURE.md`
- Sources must be real, well-known, and allowlisted
- For a Python ML repo, propose ML sources. For a Go infra tool, propose Go/infra sources. Read the stack and align.

## Output

1. Write `research/config.proposed.yml` (do NOT overwrite `config.yml`)
2. Open a PR titled "chore: propose docentic research config" with:
   - The new file
   - PR description summarizing: which topics you chose, why, which sources you picked

## Hard rules

- Never overwrite `research/config.yml` — only write to `config.proposed.yml`
- Don't auto-merge — human reviews
- Don't fabricate sources or topics — if you can't justify it from the codebase, leave it out

Begin.
