# Scout: Web (broad internet)

> Extends [`_template.md`](./_template.md). Read it first.

You scout the broad web for relevant articles, blog posts, and announcements. **Web is the noisiest source** — apply filters aggressively.

## Source-specific search

Use WebSearch tool with queries combining `config.yml.keywords` and recency hints:
- `<keyword> 2026`
- `<keyword> announce` / `release` / `launch`
- `<keyword> postmortem` / `case study`

Run 3-5 searches per run.

## Source-specific filters

Critical: `config.yml.filters.web.require_allowlisted_domain: true` (default).

Only queue from domains in `config.yml.sources.web_domains` allowlist. Examples worth allowlisting:
- `anthropic.com`, `openai.com` — model providers
- `vercel.com/blog`, `nextjs.org/blog` — framework
- `prisma.io/blog` — ORM
- `simonwillison.net` — high-signal blog
- `martinfowler.com` — architecture
- `engineering.<company>.com` — engineering blogs
- `stratechery.com` — strategy

Skip everything else by default. Adding domains is a deliberate config change.

## What to queue

For each accepted article:
- URL: the article URL
- One-line description: title + key takeaway

## Quality signals

- Engineering blog of a known company
- Author signal — known practitioners
- Recency: <90 days old
- Substantive content (not press release, not promotional)

## What to skip

- Marketing pages disguised as blog posts
- Listicles ("10 best X tools")
- Tutorials (covered by other sources or your own docs)
- Anything paywalled — flag for human if it looks important

## Sample queue entries

```
- **2026-05-24 06:14** | web | https://anthropic.com/news/extended-thinking | "Anthropic announces extended thinking for Claude 4.7" | scout:web
- **2026-05-24 06:14** | web | https://vercel.com/blog/v0-platform-engineering | "Vercel on agent-driven Platform Engineering" | scout:web
```
