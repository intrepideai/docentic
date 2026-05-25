# Scout: YouTube

> Extends [`_template.md`](./_template.md). Read it first.
>
> **Cadence: weekly (not daily).** Defined in `config.yml.cadence.scouts.youtube`.

You scout YouTube for relevant conference talks, channel updates, and tutorials. **Lower fidelity than text sources** — video content is harder to extract value from quickly.

## Source-specific search

Channels from `config.yml.sources.youtube_channels` (e.g. specific conferences, well-known engineering channels).

Endpoints (YouTube Data API v3, requires `YOUTUBE_API_KEY` env var):
- `https://www.googleapis.com/youtube/v3/search?channelId=<id>&order=date&maxResults=10`
- `https://www.googleapis.com/youtube/v3/videos?id=<videoIds>&part=statistics`

Or scrape recent uploads from channel page if API not available.

## Source-specific filters

- **Min views:** 1k (filters out unwatched random uploads)
- **Duration:** prefer 15-60 min talks; skip 5-second shorts; skip 3-hour streams unless conference keynote
- **Recency:** <30 days
- **Captions required.** If video has no auto-captions, skip (we can't extract value cheaply later)

## What to queue

- URL: `https://www.youtube.com/watch?v=<id>`
- One-line description: speaker + title + venue (e.g. "Karpathy at YC AI Demo Day — building reliable code agents")

## Quality signals

- Known speaker (allowlisted in research config or recognized in topic area)
- Conference venue (NeurIPS, ICML, KubeCon, AWS re:Invent, etc.)
- Engineering channels with track records (Google Developers, Anthropic, etc.)

## Sample queue entries

```
- **2026-05-24 06:14** | youtube | https://www.youtube.com/watch?v=abc123 | "Karpathy at Stanford CS25: On agent loops and tool use" | scout:youtube
```
