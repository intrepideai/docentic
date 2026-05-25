// Tiny Anthropic Messages API client.
//
// Uses fetch directly to keep the package dependency-free.
// If we ever want prompt caching, batches, or vision, swap to @anthropic-ai/sdk.

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MessagesRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools?: ToolDefinition[];
  tool_choice?: { type: 'tool'; name: string } | { type: 'auto' } | { type: 'any' };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface MessagesResponse {
  id: string;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence';
  content: Array<ToolUseBlock | TextBlock>;
  usage: { input_tokens: number; output_tokens: number };
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

export class AnthropicError extends Error {
  constructor(message: string, public status?: number, public body?: string) {
    super(message);
  }
}

export async function callMessages(
  req: MessagesRequest,
  opts: { apiKey: string; baseUrl?: string } = { apiKey: process.env.ANTHROPIC_API_KEY ?? '' },
): Promise<MessagesResponse> {
  if (!opts.apiKey) {
    throw new AnthropicError('ANTHROPIC_API_KEY is required');
  }
  const url = `${opts.baseUrl ?? DEFAULT_BASE_URL}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AnthropicError(`Anthropic API ${res.status}: ${body.slice(0, 500)}`, res.status, body);
  }
  return res.json() as Promise<MessagesResponse>;
}

// Estimate token count for cost budgeting. Rough: 1 token ≈ 4 chars.
// Real tokenization differs by ~10%; this is for ballpark budget checks only.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Cost estimator (USD). Defaults match Claude Sonnet 4.5 pricing as of 2026-05.
// Pass overrides if using a different model.
export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  rates: { inputPerM?: number; outputPerM?: number } = {},
): number {
  const inputPerM = rates.inputPerM ?? 3.0;   // Sonnet input
  const outputPerM = rates.outputPerM ?? 15.0; // Sonnet output
  return (inputTokens / 1_000_000) * inputPerM + (outputTokens / 1_000_000) * outputPerM;
}
