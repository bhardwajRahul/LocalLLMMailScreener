process.env.NO_AUTO_START = '1';
process.env.NODE_ENV = 'test';

import dotenv from 'dotenv';
dotenv.config();
import './real-flags.js';

import { test } from 'node:test';
import assert from 'node:assert';
import { sendPushover, checkPushoverCredentials } from '../src/pushover.js';

const useRealPushover = process.env.TEST_REAL_PUSHOVER === '1';

test(
  'real Pushover emergency send smoke test',
  { skip: !useRealPushover },
  async () => {
    const token = process.env.PUSHOVER_TOKEN || process.env.PUSHOVER_API_TOKEN;
    const user = process.env.PUSHOVER_USER;
    const device = process.env.PUSHOVER_DEVICE;

    assert.ok(token, 'PUSHOVER_TOKEN (or PUSHOVER_API_TOKEN) is required for real Pushover test');
    assert.ok(user, 'PUSHOVER_USER is required for real Pushover test');

    const credCheck = await checkPushoverCredentials({ token, user, device });
    assert.ok(credCheck.ok, `Pushover credentials check failed: ${credCheck.error || 'unknown error'}`);

    const message = `NPM TEST REAL PUSHOVER WORKED! ${new Date().toISOString()}`;
    const res = await sendPushover({
      token,
      user,
      device,
      title: 'LocalLLMMailScreener Test',
      message,
      priority: 2,
      retry: 100,
      expire: 7 * 24 * 60 * 60
    });

    assert.ok(res.receipt, 'Pushover send should return a receipt');
  }
);
