// Provider selection for `docentic populate`.
//
// Order of resolution:
//   1. DOCENT_PROVIDER (anthropic|openai|gemini) if set — must have its key.
//   2. Otherwise the first provider whose key is present, in the order
//      Anthropic → OpenAI → Gemini.

import { anthropicProvider } from './anthropic.js';
import { openaiProvider } from './openai.js';
import { geminiProvider } from './gemini.js';
import type { Provider } from './types.js';

export * from './types.js';
export { anthropicProvider, openaiProvider, geminiProvider };

export const PROVIDERS: Record<string, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
};

// Priority order when no DOCENT_PROVIDER is set.
const ORDER: Provider[] = [anthropicProvider, openaiProvider, geminiProvider];

export interface ProviderSelection {
  provider: Provider;
  apiKey: string;
}

export type SelectResult = ProviderSelection | { error: string };

export function selectProvider(env: NodeJS.ProcessEnv = process.env): SelectResult {
  const requested = env.DOCENT_PROVIDER?.trim().toLowerCase();
  if (requested) {
    const provider = PROVIDERS[requested];
    if (!provider) {
      return { error: `Unknown DOCENT_PROVIDER '${requested}'. Use one of: anthropic, openai, gemini.` };
    }
    const apiKey = env[provider.envVar];
    if (!apiKey) {
      return { error: `DOCENT_PROVIDER=${requested} but ${provider.envVar} is not set in env or .env.` };
    }
    return { provider, apiKey };
  }
  for (const provider of ORDER) {
    const apiKey = env[provider.envVar];
    if (apiKey) return { provider, apiKey };
  }
  return {
    error:
      'No LLM API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in .env ' +
      '(or pick one explicitly with DOCENT_PROVIDER).',
  };
}

// Resolve the model: explicit --model wins, else a per-task DOCENT_MODEL_*
// override, else the provider default.
export function resolveModel(
  provider: Provider,
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return explicit || env.DOCENT_MODEL_BOOTSTRAP || provider.defaultModel;
}
