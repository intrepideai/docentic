// Anthropic provider — Messages API with forced tool use.

import { DEFAULT_POPULATE_MODEL } from '../models.js';
import { LlmError, postJson, type Provider, type StructuredRequest, type StructuredResult, type FetchFn } from './types.js';

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';

interface AnthropicResponse {
  stop_reason: string;
  content: Array<{ type: string; input?: unknown }>;
  usage: { input_tokens: number; output_tokens: number };
}

export const anthropicProvider: Provider = {
  id: 'anthropic',
  envVar: 'ANTHROPIC_API_KEY',
  label: 'Anthropic',
  defaultModel: DEFAULT_POPULATE_MODEL,

  async callStructured(req: StructuredRequest, opts): Promise<StructuredResult> {
    const fetchFn: FetchFn = opts.fetchFn ?? fetch;
    if (!opts.apiKey) throw new LlmError('ANTHROPIC_API_KEY is required');
    const body = {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      tools: [{ name: req.tool.name, description: req.tool.description, input_schema: req.tool.inputSchema }],
      tool_choice: { type: 'tool', name: req.tool.name },
    };
    const json = (await postJson(
      `${opts.baseUrl ?? DEFAULT_BASE_URL}/v1/messages`,
      { 'x-api-key': opts.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body,
      fetchFn,
      'Anthropic',
    )) as AnthropicResponse;

    const toolUse = json.content?.find((b) => b.type === 'tool_use');
    return {
      input: toolUse?.input ?? null,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
      truncated: json.stop_reason === 'max_tokens',
      stopReason: json.stop_reason ?? 'unknown',
    };
  },
};
