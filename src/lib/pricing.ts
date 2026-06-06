// Token + cost estimation for `docentic populate`.
//
// Rates are USD per million tokens [input, output]. They're ballpark figures for
// the --max-cost preflight guard, not billing-grade. Unknown models fall back to
// a mid-range default so the estimate is never wildly low.

type Rate = readonly [input: number, output: number];

const RATES: Record<string, Rate> = {
  // Anthropic (per platform.claude.com pricing)
  'claude-opus-4-8': [5, 25],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5],
  // OpenAI (approximate)
  'gpt-5': [5, 15],
  'gpt-5-mini': [1, 4],
  // Google (approximate)
  'gemini-2.5-pro': [3.5, 10.5],
  'gemini-2.5-flash': [0.3, 2.5],
};

const DEFAULT_RATE: Rate = [3, 15];

// Match by exact id, then by longest known prefix (handles dated suffixes like
// `claude-haiku-4-5-20251001` or `gpt-5-2025-...`).
function rateFor(model: string): Rate {
  if (RATES[model]) return RATES[model];
  let best: Rate | undefined;
  let bestLen = 0;
  for (const [id, rate] of Object.entries(RATES)) {
    if (model.startsWith(id) && id.length > bestLen) {
      best = rate;
      bestLen = id.length;
    }
  }
  return best ?? DEFAULT_RATE;
}

// Rough token estimate for budgeting only: ~4 chars per token.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [inPerM, outPerM] = rateFor(model);
  return (inputTokens / 1_000_000) * inPerM + (outputTokens / 1_000_000) * outPerM;
}
