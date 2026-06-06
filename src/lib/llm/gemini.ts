// Google Gemini provider — generateContent with forced function calling.

import { LlmError, postJson, type Provider, type StructuredRequest, type StructuredResult, type FetchFn } from './types.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ functionCall?: { args?: unknown } }> };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

// Gemini's function-declaration schema uses OpenAPI `Type` enums in UPPER_CASE
// and rejects JSON-Schema-only keys like `additionalProperties`. Transform a
// standard JSON Schema into the accepted subset.
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === 'additionalProperties') continue;
      if (k === 'type' && typeof v === 'string') out[k] = v.toUpperCase();
      else if (k === 'properties' && v && typeof v === 'object') {
        const props: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) props[pk] = toGeminiSchema(pv);
        out[k] = props;
      } else if (k === 'items') out[k] = toGeminiSchema(v);
      else out[k] = v;
    }
    return out;
  }
  return schema;
}

export const geminiProvider: Provider = {
  id: 'gemini',
  envVar: 'GEMINI_API_KEY',
  label: 'Google Gemini',
  defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',

  async callStructured(req: StructuredRequest, opts): Promise<StructuredResult> {
    const fetchFn: FetchFn = opts.fetchFn ?? fetch;
    if (!opts.apiKey) throw new LlmError('GEMINI_API_KEY is required');
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      tools: [
        {
          functionDeclarations: [
            { name: req.tool.name, description: req.tool.description, parameters: toGeminiSchema(req.tool.inputSchema) },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [req.tool.name] } },
      generationConfig: { maxOutputTokens: req.maxTokens },
    };
    const json = (await postJson(
      `${baseUrl}/v1beta/models/${req.model}:generateContent`,
      { 'x-goog-api-key': opts.apiKey },
      body,
      fetchFn,
      'Gemini',
    )) as GeminiResponse;

    const cand = json.candidates?.[0];
    const call = cand?.content?.parts?.find((p) => p.functionCall)?.functionCall;
    return {
      input: call?.args ?? null,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
      truncated: cand?.finishReason === 'MAX_TOKENS',
      stopReason: cand?.finishReason ?? 'unknown',
    };
  },
};
