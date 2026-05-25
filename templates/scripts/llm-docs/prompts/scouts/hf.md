# Scout: Hugging Face

> Extends [`_template.md`](./_template.md). Read it first.

You scout Hugging Face for relevant models, datasets, and papers.

> **Auto-disable rule:** if this repo's stack doesn't include ML (no PyTorch / TF / sklearn / model files), the orchestrator should skip this scout. For non-ML repos, only queue if a topic explicitly mentions ML / embeddings / RAG.

## Source-specific search

Endpoints (no auth required):
- `https://huggingface.co/api/models?search=<query>&sort=downloads&limit=20`
- `https://huggingface.co/api/datasets?search=<query>&sort=downloads&limit=20`
- `https://huggingface.co/papers` — trending papers

Map `config.yml.sources.hf_interests` to query params.

## Source-specific filters

- **Min downloads:** 1k for models, 500 for datasets (skip noise)
- **Recency:** prefer models/datasets updated <90 days ago
- **License compatibility:** prefer Apache/MIT/permissive; flag proprietary

## What to queue

For each accepted item:
- URL: `https://huggingface.co/<owner>/<name>` for models, `https://huggingface.co/datasets/<owner>/<name>` for datasets, paper URLs for papers
- One-line description: name + capability summary

## Quality signals

- High download count + recent updates
- Clear model card with license, intended use, evals
- Linked to a paper or blog post
- Multiple finetunes/variants suggesting community uptake

## Sample queue entries

```
- **2026-05-24 06:14** | hf | https://huggingface.co/anthropic/example-model | "Embedding model for documentation retrieval" | scout:hf
```
