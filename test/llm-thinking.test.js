process.env.NODE_ENV = 'test';

import { test } from 'node:test';
import assert from 'node:assert';
import { parseLLMJson } from '../src/llm.js';

test('parses JSON that follows a <think> block', () => {
  const content = `<think>
Working it out
</think>
{"notify":true,"message_packet":{"title":"Alert","body":"Body","urgency":"high"},"confidence":0.9,"reason":"done"}`;

  const parsed = parseLLMJson(content);
  assert.strictEqual(parsed.notify, true);
  assert.strictEqual(parsed.message_packet.title, 'Alert');
});

test('extracts JSON when text precedes the object', () => {
  const content =
    'Sure, here is the result:\n{"notify":false,"message_packet":{"title":"FYI","body":"Body","urgency":"normal"},"confidence":0.2,"reason":"not urgent"}';

  const parsed = parseLLMJson(content);
  assert.strictEqual(parsed.notify, false);
  assert.strictEqual(parsed.message_packet.urgency, 'normal');
});

test('throws when no JSON object is present', () => {
  assert.throws(() => parseLLMJson('<think>nothing useful</think>'), /Invalid JSON from LLM/);
});
