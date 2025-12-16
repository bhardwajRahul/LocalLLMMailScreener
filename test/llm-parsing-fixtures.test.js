process.env.NODE_ENV = 'test';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert';
import { parseLLMJson } from '../src/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'llm_response_outputs.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const buildContent = (entry) => (entry.content_lines || [entry.content]).join('\n');

test('parses JSON from varied LLM response templates', () => {
  const successEntries = fixtures.filter((f) => !f.shouldError);
  for (const entry of successEntries) {
    const content = buildContent(entry);
    const parsed = parseLLMJson(content);
    assert.deepStrictEqual(
      parsed,
      entry.expected,
      `failed to parse fixture ${entry.id}: got ${JSON.stringify(parsed)}`
    );
  }
});

test('throws when no JSON object is present', () => {
  const errorEntries = fixtures.filter((f) => f.shouldError);
  for (const entry of errorEntries) {
    const content = buildContent(entry);
    assert.throws(() => parseLLMJson(content), /Invalid JSON from LLM/, `expected error for ${entry.id}`);
  }
});
