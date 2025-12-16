process.env.NO_AUTO_START = '1';
process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
dotenv.config();
import './real-flags.js';

import { test } from 'node:test';
import assert from 'node:assert';
import { createTwilioClient, checkTwilioCredentials, sendSms } from '../src/twilio.js';

const useRealTwilio = process.env.TEST_REAL_TWILIO === '1';

test(
  'real Twilio send smoke test',
  { skip: !useRealTwilio },
  async () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    const to = process.env.TWILIO_TO;

    assert.ok(accountSid, 'TWILIO_ACCOUNT_SID is required for real Twilio test');
    assert.ok(authToken, 'TWILIO_AUTH_TOKEN is required for real Twilio test');
    assert.ok(from, 'TWILIO_FROM is required for real Twilio test');
    assert.ok(to, 'TWILIO_TO is required for real Twilio test');

    const client = createTwilioClient({ accountSid, authToken });
    const credCheck = await checkTwilioCredentials(client, accountSid);
    assert.ok(credCheck.ok, `Twilio credentials check failed: ${credCheck.error || 'unknown error'}`);

    const body = `NPM TEST REAL TWILIO WORKED! ${new Date().toISOString()}`;
    const res = await sendSms({ client, to, from, body, dryRun: false });

    assert.ok(res.sid, 'Twilio send should return a message SID');
    assert.strictEqual(res.dryRun, false, 'Twilio send should not be marked as dry run');
  }
);
