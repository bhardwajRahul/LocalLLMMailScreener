## Requirements Coverage

- **Gmail**: OAuth2 via `googleapis`; polls inbox (`users.messages.list/get format=raw`) using `GMAIL_QUERY`, tracks processed IDs to avoid duplicates. Refresh tokens obtained via the `gmailtest/` utility.
- **LLM**: Sends trimmed email JSON to local OpenAI-compatible endpoint (`LLM_BASE_URL/v1/chat/completions`) with strict JSON system prompt; handles auth header when `LLM_API_KEY` is set; estimates tokens with fallback heuristic. Concurrency bounded by `MAX_LLM_CONCURRENCY` workers draining a capped queue (`MAX_LLM_QUEUE`).
- **Notification**: Pluggable service layer (`NOTIFICATION_SERVICE` = `twilio` | `pushover`):
  - **Twilio** (`twilio.js`): Official SDK; startup credential check; SMS body truncated to `MAX_SMS_CHARS`.
  - **Pushover** (`pushover.js`): HTTP API via axios; emergency priority (level 2) with retry/expire; startup credential validation.
  - Both honor `DRY_RUN` mode (no external calls, logged as dry run).
- **Email Processing** (`email_trim.js`): Normalizes and trims emails before LLM use—removes reply chains, forwards, footers; attachments kept as metadata only; body capped to `MAX_EMAIL_BODY_CHARS` with head+tail preserved.
- **State**: JSON file at `STATE_PATH`, atomic writes, keeps processed map, recent decisions/sends, token events, and stats with pruning (`MAX_PROCESSED_IDS`, `RECENT_LIMIT`).
- **Control**: Poll lock to avoid overlap; bounded LLM queue drained by concurrency workers; health checks per spec for Gmail, LLM, and active notification provider.
- **UI/API**: Express server hosting `/` dashboard and `/api/status` JSON; dashboard shows health indicators for Gmail/LLM/Notification, recent sends, token totals, LLM TPS, last 24h estimate, queue depth, and counts.
