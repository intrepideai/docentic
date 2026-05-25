# Scout: RSS / Newsletters

> Extends [`_template.md`](./_template.md). Read it first.

You scout user-curated RSS feeds. **This is the highest signal-to-noise scout** because humans already curated the source — so the bar to queue is high (it's already pre-filtered).

## Source-specific search

Feeds from `config.yml.sources.rss_feeds` (a list of URLs).

For each feed:
1. Fetch the feed (XML/Atom)
2. Parse the latest 10 entries
3. Filter by recency (skip anything already in `seen_urls`)
4. Filter by `topics` / `keywords` match

## Source-specific filters

- **High-signal feeds need light filtering.** If a feed is curated by someone we trust (Simon Willison, etc.), don't second-guess too much.
- **Recency:** post must be from last 7 days
- **Skip linkblogs that are just commentary on existing items** unless the commentary is itself the value

## What to queue

- URL: the canonical URL of the post (from `<link>` element, NOT the feed item ID if different)
- One-line description: post title + 1-clause from the post summary

## Quality signals

- Author signal (the feed source is itself the signal)
- Substantive content (>500 words usually)
- Original thinking, not aggregation

## Sample queue entries

```
- **2026-05-24 06:14** | rss | https://simonwillison.net/2026/may/24/example-post/ | "@simonw deep-dive on Claude 4.7's extended thinking" | scout:rss
- **2026-05-24 06:14** | rss | https://anthropic.com/news/claude-code-2-0 | "Anthropic blog: Claude Code 2.0 release" | scout:rss
```
