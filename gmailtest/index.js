require('dotenv').config();
const { google } = require('googleapis');

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GMAIL_USER
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error('Missing env vars: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in gmailtest/.env');
  process.exit(1);
}

const userId = GMAIL_USER || 'me';

async function fetchLatestEmail() {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const listRes = await gmail.users.messages.list({
    userId,
    maxResults: 1,
    q: 'in:inbox'
  });

  const messageId = listRes.data.messages?.[0]?.id;
  if (!messageId) {
    console.log('No messages found in inbox.');
    return;
  }

  const msgRes = await gmail.users.messages.get({
    userId,
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Subject', 'Date']
  });

  const headers = msgRes.data.payload?.headers || [];
  const getHeader = name => headers.find(h => h.name === name)?.value || '';

  console.log('Latest email:');
  console.log(`Subject: ${getHeader('Subject')}`);
  console.log(`From: ${getHeader('From')}`);
  console.log(`To: ${getHeader('To')}`);
  console.log(`Date: ${getHeader('Date')}`);
  console.log(`Snippet: ${msgRes.data.snippet}`);
  console.log(`Message ID: ${messageId}`);
}

fetchLatestEmail().catch(err => {
  console.error('Failed to fetch email:', err.message);
  if (err.response?.data) {
    console.error('Gmail API response:', err.response.data);
  }
  process.exit(1);
});
