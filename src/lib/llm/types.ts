// Provider-neutral LLM interface for `docentic populate`.
//
// populate needs exactly one capability: send a system+user prompt, force the
// model to call a single structured tool (apply_doc_edits), and get the parsed
// arguments back. Each provider (Anthropic / OpenAI / Gemini) translates that to
// its native tool/function-calling shape and normalizes the response.

export type FetchFn = typeof fetch;

export interface StructuredTool {
  name: string;
  description: string;
  /** JSON Schema for the tool input (object). */
  inputSchema: Record<string, unknown>;
}

export interface StructuredRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  tool: StructuredTool;
}

export interface StructuredResult {
  /** Parsed tool-call arguments, or null if the model didn't call the tool. */
  input: unknown;
  usage: { inputTokens: number; outputTokens: number };
  /** True if the response was cut off at max tokens (output likely truncated). */
  truncated: boolean;
  /** Provider's stop/finish reason, for diagnostics. */
  stopReason: string;
}

export interface Provider {
  id: 'anthropic' | 'openai' | 'gemini';
  /** Env var that holds this provider's API key. */
  envVar: string;
  /** Human label. */
  label: string;
  /** Model used when none is specified. */
  defaultModel: string;
  callStructured(
    req: StructuredRequest,
    opts: { apiKey: string; baseUrl?: string; fetchFn?: FetchFn },
  ): Promise<StructuredResult>;
}

export class LlmError extends Error {
  constructor(message: string, public status?: number, public body?: string) {
    super(message);
  }
}

// Shared HTTP helper — POST JSON, throw LlmError on non-2xx, return parsed JSON.
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchFn: FetchFn,
  providerLabel: string,
): Promise<unknown> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(`${providerLabel} API ${res.status}: ${text.slice(0, 500)}`, res.status, text);
  }
  return res.json();
}
