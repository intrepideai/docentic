# Scout: Lobsters

> Extends [`_template.md`](./_template.md). Read it first.

You scout Lobste.rs — a smaller, more curated tech link aggregator than HN.

## Source-specific search

Endpoints:
- `https://lobste.rs/hottest.json` — current hottest
- `https://lobste.rs/newest.json` — latest submissions
- `https://lobste.rs/t/<tag>.json` — tag-filtered (e.g. `ai`, `rust`, `programming`)

## Source-specific filters

- **Min score:** 15 (Lobste.rs has lower volume, lower scores)
- **Tag filtering:** only items matching tags in `config.yml.sources.lobsters_tags`
- **Skip dupes** — Lobste.rs often re-surfaces popular HN items

## What to queue

Same as HN — queue the LINKED URL, reference Lobste.rs discussion in description if substantive.

```
- **2026-05-24 06:14** | lobsters | https://example.com/article | "Lobste.rs discussion (32 pts): On effective code review with AI assistants" | scout:lobsters
```

## Quality signals

- Lobste.rs traditionally has fewer hot-takes and more substance per item — lower threshold for queueing is reasonable
- Established commenters add good context — worth reading for description quality
