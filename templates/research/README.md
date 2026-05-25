# Research Library

> **Anchor:** [↑ docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) · [← AGENTS.md](../AGENTS.md)
> **Purpose:** External knowledge layer for this repo. Maintained by scouts (finders), researcher (deep dives), and librarian (curator). Runs whenever the external agent orchestrator invokes [`maintain-repo`](../scripts/llm-docs/MAINTAIN.md) — typically daily.

## Folder layout

```
research/
├── README.md                     ← this file
├── config.yml                    ← topics, keywords, sources (ONLY per-repo file)
├── index.json                    ← machine-readable inventory + dedup cache
├── intake/
│   ├── QUEUE.md                  ← Pending / Processing / Processed
│   └── DISCOVERY_LOG.md          ← scout / researcher / librarian run logs
├── topics/                       ← organized by topic from config.yml
│   └── <topic>/
│       ├── papers/
│       ├── projects/
│       ├── articles/
│       ├── threads/
│       └── videos/
├── ideas/                        ← actionable; promotion candidates
├── archive/                      ← stale or low-relevance items
└── _meta/                        ← librarian-generated views (see below)
```

## The 6 views (in `_meta/`)

These are rebuilt daily by the librarian. **Each one answers a different question.**

| File | Answers | Sorted by |
|---|---|---|
| `DIGEST.md` | "What's new?" | Time, last 24h |
| `TOP-IDEAS.md` | "What are our best ideas ever?" | Quality × engagement (no decay) |
| `BY-TOPIC.md` | "What do we know about X?" | Per topic, quality-weighted |
| `ACTIONABLE.md` | "What's ready to build?" | Feasibility × impact |
| `EVERGREEN.md` | "What durable insights have we collected?" | Quality, age ≥ 90d |
| `COVERAGE.md` | "Where are the gaps?" | Topic counts vs. configured topics |

Plus `SUGGESTIONS.md` — librarian's proposed promotions and doc edits for human review.

## How to use this library

**As a team member browsing:**
- New here? Start at [`_meta/TOP-IDEAS.md`](./_meta/TOP-IDEAS.md)
- Looking for ideas on a specific topic? [`_meta/BY-TOPIC.md`](./_meta/BY-TOPIC.md)
- What should we build next? [`_meta/ACTIONABLE.md`](./_meta/ACTIONABLE.md)
- What's been hot lately? [`_meta/DIGEST.md`](./_meta/DIGEST.md)
- What gaps do we have? [`_meta/COVERAGE.md`](./_meta/COVERAGE.md)

**As an agent in this repo:**
- Searching for prior research before suggesting an approach: look in `topics/<relevant-topic>/`
- About to make an architectural decision: check `_meta/ACTIONABLE.md` for relevant prior research
- Need to suggest doc improvements: check `_meta/SUGGESTIONS.md` for librarian's pending proposals

## Pipeline overview

```
config.yml  →  10 scouts (parallel)  →  intake/QUEUE.md  →  researcher  →  topics/<topic>/  →  librarian  →  _meta/*
```

Full spec: [`../scripts/llm-docs/MAINTAIN.md`](../scripts/llm-docs/MAINTAIN.md).

## Cost ballpark

At Sonnet-class rates, this whole pipeline runs ~$0.50–$1.50 per day for this repo. The bulk goes to the researcher's deep dives.

## See also

- [↑ docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — system anchor
- [`config.yml`](./config.yml) — topics, sources, cadence
- [`../AGENTS.md`](../AGENTS.md) — root repo index
