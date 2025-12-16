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
  cleanupFile,
  fixtures,
  makeLLMStub
} from './helpers.js';

let cleanupTasks = [];
afterEach(async () => {
  for (const fn of cleanupTasks.reverse()) {
    await fn();
  }
  cleanupTasks = [];
});

test('sends notification via Pushover when notify=true', async () => {
  const emails = buildEmails(['m1']);
  const mockGmail = createMockGmail(emails);
  const llmStub = makeLLMStub(fixtures.llm.positive);
  const calls = [];

  const pushoverSender = async (opts) => {
    calls.push(opts);
    return { receipt: 'R-123' };
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
    llmCaller: llmStub.caller,
    llmHealthChecker: llmStub.health,
    startPolling: false,
    skipTwilioStartupCheck: true,
    startServer: false
  });
  cleanupTasks.push(() => appRunner.stop());

  await appRunner.pollNow();

  assert.strictEqual(calls.length, 1);
  const opts = calls[0];
  assert.strictEqual(opts.priority, 2);
  assert.strictEqual(opts.retry, 100);
  assert.strictEqual(opts.expire, 7 * 24 * 60 * 60);
  assert.strictEqual(opts.token, 'PUSHOVER_TOKEN');
  assert.strictEqual(opts.user, 'PUSHOVER_USER');

  const state = appRunner.ctx.stateManager.getState();
  assert.strictEqual(state.recent_sends.length, 1);
  const send = state.recent_sends[0];
  assert.strictEqual(send.notification_provider, 'pushover');
  assert.strictEqual(send.pushover_receipt, 'R-123');
  assert.strictEqual(state.stats.notifications_sent, 1);
  assert.strictEqual(state.stats.pushover.last_error, '');
});
