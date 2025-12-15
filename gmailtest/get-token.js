require('dotenv').config();
const readline = require('readline');
const { google } = require('googleapis');

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Missing env vars: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in gmailtest/.env');
  process.exit(1);
}

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const redirectUri = GOOGLE_REDIRECT_URI || 'http://localhost';

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  redirectUri
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES
});

console.log('1) Open this URL in your browser to authorize access to Gmail:\n');
console.log(authUrl);
console.log(
  '\n2) After approving, you will be redirected to localhost (it may show a connection error). Copy the full URL (it includes "?code=...").'
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('\n3) Paste the code or full redirected URL here: ', async input => {
  rl.close();

  const codeMatch = input.trim().match(/[?&]code=([^&]+)/);
  const code = codeMatch ? decodeURIComponent(codeMatch[1]) : input.trim();

  if (!code) {
    console.error('No code found. Please rerun and paste the "code" from the redirect URL.');
    process.exit(1);
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.error('No refresh token returned. Add prompt=consent and rerun, or revoke prior consent and try again.');
      process.exit(1);
    }

    console.log('\nSuccess! Add this to gmailtest/.env as GOOGLE_REFRESH_TOKEN:');
    console.log(tokens.refresh_token);
  } catch (err) {
    console.error('Failed to exchange code for tokens:', err.message);
    if (err.response?.data) {
      console.error(err.response.data);
    }
    process.exit(1);
  }
});
