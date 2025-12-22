process.env.NO_AUTO_START = '1';
process.env.NODE_ENV = 'test';

import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { startApp } from '../src/index.js';
import {
  buildEmails,
  createMockGmail,
  createTwilioMock,
  tmpStatePath,
  cleanupFile
} from './helpers.js';

let cleanupTasks = [];
afterEach(async () => {
  for (const fn of cleanupTasks.reverse()) {
    await fn();
  }
  cleanupTasks = [];
});

test('sends a single outage alert via Pushover when LLM fails but notifications are healthy', async () => {
  const emails = buildEmails(['m1', 'm2']);
  const mockGmail = createMockGmail(emails);
  const pushoverCalls = [];

  const pushoverSender = async (opts) => {
    pushoverCalls.push(opts);
    return { receipt: `R-${pushoverCalls.length}` };
  };

  const statePath = tmpStatePath();
  cleanupTasks.push(() => cleanupFile(statePath));

  const appRunner = await startApp({
    configOverrides: {
      notificationService: 'pushover',
      port: 0,
      statePath,
      pollIntervalMs: 1000,
      pollMaxResults: 5,
      dryRun: false,
      pushoverToken: 'PUSHOVER_TOKEN',
      pushoverUser: 'PUSHOVER_USER'
    },
    gmailClient: mockGmail,
    twilioClient: createTwilioMock('success'),
    pushoverSender,
    pushoverValidator: async () => ({ ok: true }),
    llmCaller: async () => {
      throw new Error('LLM offline');
    },
    llmHealthChecker: async () => ({ ok: false, error: 'LLM offline' }),
    startPolling: false,
    skipTwilioStartupCheck: false,
    startServer: false
  });
  cleanupTasks.push(() => appRunner.stop());

  // First poll processes two emails; the first LLM failure should trigger exactly one outage alert.
  await appRunner.pollNow();

  assert.strictEqual(pushoverCalls.length, 1);
  const call = pushoverCalls[0];
  assert.strictEqual(call.priority, 2);
  assert.strictEqual(call.retry, 60);
  assert.strictEqual(call.expire, 60 * 60);
  assert.strictEqual(call.token, 'PUSHOVER_TOKEN');
  assert.strictEqual(call.user, 'PUSHOVER_USER');
  assert.match(call.title, /ALERT/i);
  assert.match(call.message, /LLM offline/);

  const state = appRunner.ctx.stateManager.getState();
  const send = state.recent_sends.at(-1);
  assert.strictEqual(send.reason, 'service_outage');
  assert.deepStrictEqual(send.outage_services, ['llm']);
  assert.ok(state.alerts.llm_down_at > 0);
  assert.ok(state.alerts.llm_last_alert_at >= state.alerts.llm_down_at);

  // Re-run poll to confirm no duplicate outage alerts while still down.
  await appRunner.pollNow();
  assert.strictEqual(pushoverCalls.length, 1);
});
