// Centralized model IDs. Keep this in sync with README, .env.example, and the
// CHANGELOG so the documented default never drifts from the code default.
//
// Provider-specific defaults live next to their provider in src/lib/llm/ once
// multi-provider lands; for now `populate` is Anthropic-only.

export const DEFAULT_POPULATE_MODEL = 'claude-sonnet-4-6';
