# Scout: X (Twitter)

> Extends [`_template.md`](./_template.md). Read it first.

You scout X/Twitter for relevant URLs. Read the universal contract above; this file covers only X-specific behavior.

## Source-specific search

For each run, search across:
1. Allowlisted accounts from `config.yml.sources.x_handles` — read their recent posts
2. Topic-keyword searches across all of X (e.g. search the `keywords` list)
3. Reply threads under high-signal posts (threads >> single tweets)

Cap each list at the top ~10 hits before filtering.

## Source-specific filters

- **Threads >> single tweets.** A 5-tweet thread that ties an idea together is worth more than a one-liner. When in doubt, prefer threads.
- **Engagement floor.** Skip tweets with <50 likes unless from an allowlisted account.
- **Skip retweets** that don't add commentary.
- **Verified / known accounts** — boost relevance score; helpful but not required.
- **No screenshots-only tweets.** If the content is in an image, we can't extract it cheaply.

## What to queue

For each accepted tweet:
- The URL is `https://x.com/<handle>/status/<id>`
- One-line description: who said it + the gist (e.g. "@karpathy on prompt caching strategies in agent loops")

## What to skip

- Reply chains where the original is by a non-allowlisted account
- Tweets that are just memes or commentary on news
- Crypto/grift content (use `exclusions` list)
- Self-promotional product launches unless directly relevant

## Tools you'll use

Depends on host runtime. Common options:
- `bird` CLI for read-only access (`bird search "<query>" --plain`, `bird read "<url>" --plain`)
- WebSearch tool
- Direct X API (if credentials are set)

Pick whatever is available. Don't fail if a specific tool is missing.

## Sample queue entries

```
- **2026-05-24 06:14** | x | https://x.com/karpathy/status/123 | "@karpathy thread on RAG vs long-context tradeoffs for code agents" | scout:x
- **2026-05-24 06:14** | x | https://x.com/simonw/status/456 | "@simonw on Anthropic's new prompt-caching pricing model" | scout:x
```
