// OpenAI provider — Chat Completions API with forced function calling.
// Works with OpenAI-compatible gateways via OPENAI_BASE_URL.

import { LlmError, postJson, type Provider, type StructuredRequest, type StructuredResult, type FetchFn } from './types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAIResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export const openaiProvider: Provider = {
  id: 'openai',
  envVar: 'OPENAI_API_KEY',
  label: 'OpenAI',
  defaultModel: process.env.OPENAI_MODEL || 'gpt-5',

  async callStructured(req: StructuredRequest, opts): Promise<StructuredResult> {
    const fetchFn: FetchFn = opts.fetchFn ?? fetch;
    if (!opts.apiKey) throw new LlmError('OPENAI_API_KEY is required');
    const baseUrl = opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;
    const body = {
      model: req.model,
      max_completion_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      tools: [
        {
          type: 'function',
          function: { name: req.tool.name, description: req.tool.description, parameters: req.tool.inputSchema },
        },
      ],
      tool_choice: { type: 'function', function: { name: req.tool.name } },
    };
    const json = (await postJson(
      `${baseUrl}/chat/completions`,
      { authorization: `Bearer ${opts.apiKey}` },
      body,
      fetchFn,
      'OpenAI',
    )) as OpenAIResponse;

    const choice = json.choices?.[0];
    const args = choice?.message?.tool_calls?.[0]?.function?.arguments;
    let input: unknown = null;
    if (typeof args === 'string') {
      try { input = JSON.parse(args); } catch { input = null; }
    }
    return {
      input,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
      truncated: choice?.finish_reason === 'length',
      stopReason: choice?.finish_reason ?? 'unknown',
    };
  },
};
