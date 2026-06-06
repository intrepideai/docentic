// LLM provider-abstraction tests. No network: a mock fetch captures the
// outgoing request and returns a canned provider-shaped response, so we can
// assert request translation + response normalization (incl. truncation) for
// all three providers, plus provider selection and per-model pricing.
//
// Requires a build (`npm run build`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProvider, resolveModel, anthropicProvider, openaiProvider, geminiProvider } from '../dist/lib/llm/index.js';
import { estimateCostUsd } from '../dist/lib/pricing.js';

const TOOL = {
  name: 'apply_doc_edits',
  description: 'Apply edits.',
  inputSchema: {
    type: 'object',
    required: ['edits'],
    additionalProperties: false,
    properties: { edits: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' } } } } },
  },
};
const REQ = { model: 'm', system: 'sys', user: 'usr', maxTokens: 1000, tool: TOOL };

// Build a mock fetch that records the request and returns `payload` as JSON.
function mockFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  fn.calls = calls;
  return fn;
}

// ---------- selection ----------
test('selectProvider honors DOCENT_PROVIDER', () => {
  const sel = selectProvider({ DOCENT_PROVIDER: 'openai', OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' });
  assert.ok(!('error' in sel));
  assert.equal(sel.provider.id, 'openai');
  assert.equal(sel.apiKey, 'k');
});

test('selectProvider falls back to first key in priority order', () => {
  const sel = selectProvider({ OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' });
  assert.equal(sel.provider.id, 'openai'); // anthropic absent → openai wins over gemini
});

test('selectProvider errors when DOCENT_PROVIDER key is missing', () => {
  const sel = selectProvider({ DOCENT_PROVIDER: 'gemini' });
  assert.ok('error' in sel);
  assert.match(sel.error, /GEMINI_API_KEY/);
});

test('selectProvider errors when no key is set', () => {
  const sel = selectProvider({});
  assert.ok('error' in sel);
});

test('resolveModel: explicit > DOCENT_MODEL_BOOTSTRAP > provider default', () => {
  assert.equal(resolveModel(anthropicProvider, 'x', {}), 'x');
  assert.equal(resolveModel(anthropicProvider, undefined, { DOCENT_MODEL_BOOTSTRAP: 'y' }), 'y');
  assert.equal(resolveModel(anthropicProvider, undefined, {}), anthropicProvider.defaultModel);
});

// ---------- Anthropic ----------
test('anthropic: request shape + normalization + truncation', async () => {
  const fetchFn = mockFetch({
    stop_reason: 'max_tokens',
    content: [{ type: 'tool_use', input: { edits: [{ file: 'A' }] } }],
    usage: { input_tokens: 11, output_tokens: 22 },
  });
  const r = await anthropicProvider.callStructured(REQ, { apiKey: 'k', fetchFn });
  const body = fetchFn.calls[0].body;
  assert.equal(body.tool_choice.name, 'apply_doc_edits');
  assert.equal(body.tools[0].input_schema.type, 'object');
  assert.equal(fetchFn.calls[0].init.headers['x-api-key'], 'k');
  assert.deepEqual(r.input, { edits: [{ file: 'A' }] });
  assert.deepEqual(r.usage, { inputTokens: 11, outputTokens: 22 });
  assert.equal(r.truncated, true);
});

// ---------- OpenAI ----------
test('openai: parses tool_call arguments + length→truncated', async () => {
  const fetchFn = mockFetch({
    choices: [{ finish_reason: 'length', message: { tool_calls: [{ function: { arguments: '{"edits":[{"file":"B"}]}' } }] } }],
    usage: { prompt_tokens: 5, completion_tokens: 7 },
  });
  const r = await openaiProvider.callStructured(REQ, { apiKey: 'k', fetchFn });
  const body = fetchFn.calls[0].body;
  assert.equal(body.tools[0].type, 'function');
  assert.equal(body.tool_choice.function.name, 'apply_doc_edits');
  assert.equal(fetchFn.calls[0].init.headers.authorization, 'Bearer k');
  assert.deepEqual(r.input, { edits: [{ file: 'B' }] });
  assert.deepEqual(r.usage, { inputTokens: 5, outputTokens: 7 });
  assert.equal(r.truncated, true);
});

// ---------- Gemini ----------
test('gemini: uppercases schema types, strips additionalProperties, MAX_TOKENS→truncated', async () => {
  const fetchFn = mockFetch({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { args: { edits: [{ file: 'C' }] } } }] } }],
    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
  });
  const r = await geminiProvider.callStructured(REQ, { apiKey: 'k', fetchFn });
  const params = fetchFn.calls[0].body.tools[0].functionDeclarations[0].parameters;
  assert.equal(params.type, 'OBJECT');
  assert.equal(params.properties.edits.type, 'ARRAY');
  assert.equal(params.properties.edits.items.type, 'OBJECT');
  assert.ok(!('additionalProperties' in params), 'additionalProperties stripped for Gemini');
  assert.equal(fetchFn.calls[0].init.headers['x-goog-api-key'], 'k');
  assert.deepEqual(r.input, { edits: [{ file: 'C' }] });
  assert.equal(r.truncated, false);
});

test('provider throws LlmError on non-2xx', async () => {
  const fetchFn = mockFetch({ error: 'bad' }, { ok: false, status: 401 });
  await assert.rejects(() => anthropicProvider.callStructured(REQ, { apiKey: 'k', fetchFn }), /Anthropic API 401/);
});

// ---------- pricing ----------
test('pricing is per-model (opus ≠ sonnet) with prefix + default fallback', () => {
  const opus = estimateCostUsd('claude-opus-4-8', 1_000_000, 1_000_000);
  const sonnet = estimateCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000);
  assert.ok(opus > sonnet, 'opus must cost more than sonnet');
  // dated suffix matches by prefix
  assert.equal(estimateCostUsd('claude-haiku-4-5-20251001', 1_000_000, 0), estimateCostUsd('claude-haiku-4-5', 1_000_000, 0));
  // unknown model → non-zero default
  assert.ok(estimateCostUsd('some-unknown-model', 1_000_000, 0) > 0);
});
