# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                # Run the server (port 3000)
npm test                 # Unit tests (excludes prompt injection tests)
npm run test:injection   # Prompt injection test suite (CLI)
```

**Running a single test:**
```bash
NO_AUTO_START=1 node --test --test-name-pattern="test name here" test/some.test.js
```

**Real integration tests** (hit live services — these are slow):
```bash
TEST_REAL_LLM=1 npm test           # Uses local LM Studio
TEST_REAL_GMAIL=1 npm test         # Uses real Gmail API
TEST_REAL_PUSHOVER=1 npm test      # Sends real push notification
TEST_REAL_TWILIO=1 npm test        # Sends real SMS
REAL=G,L,P,T npm test              # Shorthand for all flags
TEST_LLM_DEBUG=1 npm test          # Logs raw LLM responses
```

## Architecture

Gmail polling service that sends emails to a local LLM (LM Studio, OpenAI-compatible API) for importance triage, then notifies via Twilio SMS or Pushover.

**Core flow:** Gmail poll → parse/trim email → enqueue → LLM classifies (JSON) → notify if important

### Key Modules (all ESM)

- **`src/index.js`** — Orchestrator: polling loop, LLM queue, Express server, outage alerts. Exports `startApp(overrides)` which accepts mock injections for testing.
- **`src/llm.js`** — LLM API calls, thinking token stripping, JSON response parsing. System prompt is hot-loaded from disk on every call (edit `data/system_prompt.txt` without restart).
- **`src/email_trim.js`** — Normalizes emails before LLM: strips reply chains, footers, enforces body length cap. Records what was removed as metadata.
- **`src/url_extract.js`** — Phishing detection: IP-based URLs, display/href mismatches, sender domain analysis. Runs before LLM, results passed as context.
- **`src/state.js`** — JSON file persistence with atomic writes (temp + rename). No external database.
- **`src/gmail.js`** — Gmail OAuth2, message fetching, MIME parsing via mailparser.
- **`src/gpu.js`** — Apple Silicon GPU utilization monitoring. Auto-disabled in test mode.

### Non-Obvious Patterns

**Thinking token handling** (`src/llm.js`): Models like Qwen 3.5 emit `<think>...</think>` blocks before JSON. `parseLLMJson()` strips these then tries multiple extraction strategies: raw content → stripped content → regex-extracted JSON objects (last match wins). Parse errors are tagged with `isParseError` so callers distinguish them from connection failures.

**LLM queue** (`src/index.js`): Self-pumping async queue with bounded concurrency (`MAX_LLM_CONCURRENCY`) and capacity (`MAX_LLM_QUEUE`). Drops oldest pending email on overflow. `whenIdle()` returns a promise for test synchronization.

**Outage alerts**: Single-fire per incident. Tracks `down_at` vs `last_alert_at` timestamps. Only connection/timeout errors trigger alerts — JSON parse errors do not.

**Time context injection**: Every LLM call prepends current date/time/time-of-day to the system prompt so the model can reason about urgency timing.

**Gmail polling window**: Uses `after:<epoch>` with a grace period (`POLL_GRACE_MS`) subtracted to prevent emails from slipping between polls.

## Testing

- Framework: Node.js built-in `node:test` (no external test runner)
- Mocking: Dependency injection via `startApp({ gmailClient, twilioClient, llmCaller, ... })`
- Mock builders: `test/helpers.js` — `createMockGmail()`, `createTwilioMock()`, `makeLLMStub()`
- Fixtures: `test/fixtures/` — JSON mocks, raw `.eml` files, LLM response templates
- Tests set `NO_AUTO_START=1` and `NODE_ENV=test` to prevent auto-startup and disable GPU

## Configuration

All config via `.env` (read at startup via dotenv — restart required for changes). See `.env.example` for all variables. Key settings:

- `LLM_BASE_URL` — OpenAI-compatible endpoint (default: `http://127.0.0.1:1234`)
- `LLM_MODEL` — Model identifier as shown in LM Studio
- `LLM_MAX_OUTPUT_TOKENS` — Must be large for thinking models (32768 for Qwen 3.5)
- `NOTIFICATION_SERVICE` — `twilio` or `pushover`
- `SYSTEM_PROMPT_PATH` — Path to system prompt (default: `./data/system_prompt.txt`)
- `DRY_RUN` — Skip actual notification sends
