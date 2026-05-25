# Scout: Reddit

> Extends [`_template.md`](./_template.md). Read it first.

You scout Reddit for high-signal threads in domain-specific subreddits.

## Source-specific search

Subreddits from `config.yml.sources.reddit_subs` (e.g. `r/MachineLearning`, `r/LocalLLaMA`, `r/programming`, `r/nextjs`).

Endpoints (no auth needed for public listings):
- `https://www.reddit.com/r/<sub>/top.json?t=day&limit=15`
- `https://www.reddit.com/r/<sub>/hot.json?limit=15`
- `https://www.reddit.com/r/<sub>/new.json?limit=15`

Append `.json` to any Reddit URL for structured data.

## Source-specific filters

Apply `config.yml.filters.reddit.min_upvotes` (default 25).

- **Self posts > link posts** when the discussion is the value
- **Skip image/meme posts**
- **Skip "help me" posts** unless the question reveals an interesting problem
- **Comments matter** — a post with 100 thoughtful comments is more valuable than one with 100 upvotes and 0 discussion

## What to queue

- URL: `https://www.reddit.com<permalink>`
- One-line description: post title + 1-clause on the substantive content (e.g. "r/MachineLearning thread: how Claude Code handles context compaction — Anthropic engineer responds")

## Quality signals

- Active discussion in last 24h
- Substantive top-level comments from named accounts
- Cross-posted from a credible source (X, arxiv, blog) — sometimes the Reddit discussion IS the value

## Sample queue entries

```
- **2026-05-24 06:14** | reddit | https://www.reddit.com/r/LocalLLaMA/comments/xyz/ | "Discussion: GGUF vs MLX for local code agents" | scout:reddit
```
