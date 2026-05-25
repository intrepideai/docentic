# Topics

> Research items organized by topic. Topics are defined in [`../config.yml`](../config.yml).

The researcher creates subdirectories per topic on demand. Expected shape:

```
topics/
├── <topic-1>/
│   ├── papers/         # arxiv items
│   ├── projects/       # github / hf items
│   ├── articles/       # web / rss / hn / lobsters items
│   ├── threads/        # x / reddit items
│   └── videos/         # youtube items
├── <topic-2>/
│   └── ...
└── _uncategorized/     # items the researcher couldn't classify; librarian sorts
```

## Configured topics

See [`../config.yml`](../config.yml) `topics:` field. The Config Seeder agent (Prompt 2) populates this with repo-specific topics during bootstrap.

When research clusters around a topic not in `config.yml`, the librarian flags it in [`../_meta/SUGGESTIONS.md`](../_meta/SUGGESTIONS.md). Humans decide whether to add it.

---

_No topic folders yet. First scheduled run will create them as needed._
