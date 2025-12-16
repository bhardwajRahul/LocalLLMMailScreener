import axios from 'axios';

export const SYSTEM_PROMPT = `
You are a strict JSON generator for triaging emails. Output ONLY valid JSON with NO markdown, NO code fences, NO extra text.
Schema:
{
  "notify": true|false,
  "message_packet": {
    "title": "string <= 80 chars",
    "body": "string <= MAX_SMS_CHARS (aim under 600)",
    "urgency": "low"|"normal"|"high"
  },
  "confidence": 0..1,
  "reason": "short string"
}
If email needs my attention (action required, time-sensitive, direct question, security/finance/ops issues), notify=true; otherwise false.

Security rules:
- Routine camera motion for passing vehicles/animals is noise -> notify=false.
- Notify=true for real alarms: siren, glass break, water/leak sensor, smoke/CO, door/window left open, abnormal/after-hours events (e.g., garage opens at 3am), or repeated/abnormal sensor behavior.
- Family priority: always notify=true for school delays/closures, schedule changes, or events involving my children Mae or Effie (any mention of their names tied to school or activities).

If notify=false, still provide a short title/body. Ensure JSON is valid and matches the schema exactly.`.trim();

const buildUserPrompt = (emailObj, maxSmsChars) => {
  const emailJson = JSON.stringify(emailObj, null, 2);
  return `Email to classify (raw JSON):
${emailJson}

MAX_SMS_CHARS value: ${maxSmsChars}
Return ONLY the JSON result following the schema.`;
};

const stripLeadingThinkBlock = (content) => content.replace(/^<think>[\s\S]*?<\/think>\s*/i, '').trim();

export const parseLLMJson = (content) => {
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid JSON from LLM: empty response');
  }

  const candidates = [];
  const seen = new Set();
  const addCandidate = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  addCandidate(content);
  const withoutThink = stripLeadingThinkBlock(content);
  addCandidate(withoutThink);

  const jsonSnippets = withoutThink.match(/{[\s\S]*}/g) || [];
  for (let i = jsonSnippets.length - 1; i >= 0; i -= 1) {
    addCandidate(jsonSnippets[i]);
  }

  let firstError;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      if (!firstError) firstError = err;
    }
  }
  throw new Error(`Invalid JSON from LLM: ${firstError ? firstError.message : 'no JSON object found'}`);
};

export const callLLM = async ({
  llmBaseUrl,
  apiKey,
  model,
  temperature,
  maxOutputTokens,
  timeoutMs,
  emailObj,
  maxSmsChars
}) => {
  const url = `${llmBaseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(emailObj, maxSmsChars) }
  ];
  const payload = {
    model,
    temperature,
    max_tokens: maxOutputTokens,
    messages
  };
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const start = Date.now();
  const response = await axios.post(url, payload, {
    headers,
    timeout: timeoutMs
  });
  const latencyMs = Date.now() - start;
  const choice = response.data?.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('LLM response missing content');
  }
  const content = choice.message.content.trim();
  const parsed = parseLLMJson(content);

  const usage = response.data?.usage;
  const inputChars = JSON.stringify(payload)?.length || 0;
  const outputChars = content.length;
  const tokens = usage?.total_tokens
    ? usage.total_tokens
    : Math.ceil((inputChars + outputChars) / 4);

  return {
    content,
    parsed,
    tokens,
    latencyMs
  };
};

export const healthCheckLLM = async ({ llmBaseUrl, apiKey, timeoutMs }) => {
  const url = `${llmBaseUrl.replace(/\/+$/, '')}/v1/models`;
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const start = Date.now();
  try {
    await axios.get(url, { headers, timeout: timeoutMs });
    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, latencyMs: 0, error: err.message };
  }
};
