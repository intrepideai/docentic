# Scout: arXiv

> Extends [`_template.md`](./_template.md). Read it first.

You scout arXiv for new papers relevant to this codebase's research interests.

## Source-specific search

Fetch new submissions from declared categories (`config.yml.sources.arxiv_categories`, e.g. `cs.AI`, `cs.CL`, `cs.SE`).

Endpoints:
- `https://arxiv.org/list/<category>/new` — last 24h submissions
- `https://arxiv.org/list/<category>/recent` — last week
- `https://export.arxiv.org/api/query?search_query=<query>` — keyword search

## Source-specific filters

- **Title + abstract only.** Don't fetch full PDFs.
- **Match on keywords in title or first 200 chars of abstract.**
- **Skip surveys** unless explicitly relevant (they're long; if you queue one, the researcher will spend a lot on it)
- **Skip purely theoretical papers** unless `topics` includes theory

## What to queue

For each accepted paper:
- URL: `https://arxiv.org/abs/<id>`
- One-line description: paper title + one-clause takeaway (e.g. "Constrained decoding for tool-use accuracy — claims 18% improvement")

## Quality signals

- Authors from known labs (DeepMind, OAI, Anthropic, FAIR, etc.) — boost
- Cross-references to recent influential work — boost
- Has code release linked — strong boost

## Sample queue entries

```
- **2026-05-24 06:14** | arxiv | https://arxiv.org/abs/2405.12345 | "Long-context coding agents with hierarchical memory" | scout:arxiv
- **2026-05-24 06:14** | arxiv | https://arxiv.org/abs/2405.67890 | "Prompt-cache-aware routing for multi-tenant LLM serving" | scout:arxiv
```
