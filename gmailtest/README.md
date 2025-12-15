# Gmail Test (single user)

Minimal Node script to prove Gmail API access by fetching one message from your inbox. No onboarding or multi-user flow; uses a single refresh token for your Gmail account.

## Google Cloud setup (one-time)
1) Go to https://console.cloud.google.com/ and create/select a project.
2) APIs & Services → Library → enable **Gmail API**.
3) APIs & Services → OAuth consent screen:
   - User type: External (for personal Gmail) or Internal if Workspace.
   - Fill basic app info; add yourself as a Test user if External; save/publish in testing mode.
4) APIs & Services → Credentials → **Create Credentials → OAuth client ID → Desktop app**. Copy the **Client ID** and **Client Secret**.

## Local setup
1) Copy `.env.example` to `.env` inside `gmailtest/` and fill:
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from the step above.
   - `GMAIL_USER` = the Gmail address you are authorizing.
   - Leave `GOOGLE_REDIRECT_URI` as `http://localhost` (works with the Desktop client).
2) Install deps:
   ```bash
   cd gmailtest
   npm install
   ```

## Generate a refresh token (one-time)
1) Run `npm run get-token`.
2) Open the printed URL, sign in, and approve Gmail readonly.
3) Browser will redirect to `http://localhost/?code=...` and may show a connection error; copy the full redirect URL (or just the `code` value).
4) Paste it back into the prompt. The script prints a `GOOGLE_REFRESH_TOKEN`; add it to your `.env`.

If you ever revoke access, rerun `npm run get-token` to get a new refresh token.

## Fetch the latest email
```bash
npm start
```
Outputs Subject/From/To/Date/Snippet for the newest inbox message. Adjust the search query in `index.js` (`q: 'in:inbox'`) if you want different filtering.
