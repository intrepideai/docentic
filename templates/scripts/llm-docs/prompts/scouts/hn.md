# Scout: Hacker News

> Extends [`_template.md`](./_template.md). Read it first.

You scout Hacker News for high-signal tech stories relevant to this codebase's topics.

## Source-specific search

Endpoints:
- `https://hacker-news.firebaseio.com/v0/topstories.json` — current top 500
- `https://hn.algolia.com/api/v1/search?query=<q>&tags=story&hitsPerPage=20`
- `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=<q>`

For each story, fetch via `/v0/item/<id>.json` to get title + URL + score.

## Source-specific filters

- **Min score:** 50 points (HN's noise floor is ~20-30)
- **Min comments:** 10 (filters out pure link posts with no discussion)
- **Skip Ask HN unless explicitly on-topic** (most are not)
- **Skip job posts** (`type === "job"`)
- **Recency:** prefer last 48h; older stories should have explicit topic match

## What to queue

For HN stories, the URL of interest is usually the LINKED URL, not the HN comment page. Queue the underlying article URL, and reference the HN discussion in the description.

```
- **2026-05-24 06:14** | hn | https://example.com/article | "Article + HN discussion (321 pts, 87 comments): On building reliable LLM agents" | scout:hn
```

For "Show HN" with substantial discussion, queueing the HN URL itself is OK.

## Quality signals

- Score > 200 with high comment-to-score ratio (engaged discussion)
- "Ask HN" or "Show HN" with senior practitioners in the comments
- Links to engineering blog posts of credible companies

## What to skip

- Speculation/news without engineering content
- Crypto / politics / general tech news
- Repeat submissions (HN often re-submits popular stories)
