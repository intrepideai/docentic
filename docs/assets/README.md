# docs/assets

Visual assets for the README.

| File | Purpose |
|---|---|
| `logo-light.svg` | Hub-and-spoke logo for light backgrounds |
| `logo-dark.svg` | Same, for dark backgrounds (auto-selected via `<picture>` + `prefers-color-scheme`) |
| `demo.tape` | [VHS](https://github.com/charmbracelet/vhs) script that records `demo.gif` |
| `demo.gif` | Terminal recording of `docent init` (regenerate via `vhs demo.tape`) |

## Regenerating the demo GIF

```bash
brew install vhs       # or: go install github.com/charmbracelet/vhs@latest
cd <repo root>
vhs docs/assets/demo.tape
```

Output lands at `docs/assets/demo.gif`. Re-commit and push.

## Updating the logo

The current logo is a hand-coded SVG representing docent's design principle (hub-and-spoke: ARCHITECTURE.md at center, spine files radiating out, repo boundary as the outer ring). If you replace it with a designer's mark, keep both light and dark variants and the same dimensions (~160x160 viewBox).
