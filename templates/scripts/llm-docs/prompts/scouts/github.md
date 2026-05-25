# Scout: GitHub

> Extends [`_template.md`](./_template.md). Read it first.

You scout GitHub for novel, well-maintained repos relevant to this codebase's topics.

## Source-specific search

Use the `gh` CLI (available in most environments):

```bash
gh search repos "<keyword>" --sort=stars --order=desc --limit=15
gh search repos "<keyword>" --sort=updated --created=">$(date -v-30d +%Y-%m-%d)" --limit=15
```

Run 2-4 queries per run, drawn from `config.yml.keywords` and `config.yml.sources.github_topics`.

## Source-specific filters

Apply `config.yml.filters.github` (defaults shown):

| Filter | Default | Effect |
|---|---|---|
| `min_stars` | 50 | Skip repos under threshold unless very new (<7 days) with active commits |
| `max_age_days_unknown` | 30 | New repos must be <30 days old to count without star threshold |
| Skip forks | always | `--no-forks` or post-filter |
| Skip archived | always | check `isArchived` |

Also skip:
- Tutorials, courses, "awesome-X" lists
- Single-commit repos (looks like spam)
- Repos with no README

## What to queue

For each accepted repo:
- URL: `https://github.com/<owner>/<repo>`
- One-line description: from the GitHub description field, edited if necessary for clarity

## Quality signals to consider

- Stars + recency combo (a 100-star repo from last week beats a 1000-star repo from 3 years ago)
- Active commits in last 30 days
- Multiple contributors
- Clear README explaining what it does
- Production language (TypeScript/Python/Rust/Go) — not just shell scripts or notebooks

## Sample queue entries

```
- **2026-05-24 06:14** | github | https://github.com/anthropics/skills | "Anthropic Skills repo — example agent skills" | scout:github
- **2026-05-24 06:14** | github | https://github.com/owner/repo | "Lightweight Prisma observability layer" | scout:github
```
