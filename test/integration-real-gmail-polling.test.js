process.env.NO_AUTO_START = '1';
process.env.NODE_ENV = 'test';

import './real-flags.js';
import { test } from 'node:test';
import assert from 'node:assert';
import { startApp } from '../src/index.js';
import { makeLLMStub, createTwilioMock, tmpStatePath, cleanupFile } from './helpers.js';

const useRealGmail = process.env.TEST_REAL_GMAIL === '1';
const hasGmailCreds =
  process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN;

test(
  'real Gmail poll (configured interval, mocked LLM/Twilio, no cap)',
  { skip: !(useRealGmail && hasGmailCreds) },
  async () => {
    const twilioMock = createTwilioMock('success');
    const llmStub = makeLLMStub({
      default: {
        notify: false,
        reason: 'mock llm decision for real gmail poll',
        title: 'Mock',
        body: 'Mock body',
        tokens: 5,
        latencyMs: 10
      }
    });
    const decisions = [];
    const statePath = tmpStatePath();

    const appRunner = await startApp({
      configOverrides: {
        port: 0,
        statePath,
        pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '15000', 10),
        pollMaxResults: parseInt(process.env.POLL_MAX_RESULTS || '25', 10),
        dryRun: true,
        notificationService: 'twilio'
      },
      twilioClient: twilioMock,
      llmCaller: llmStub.caller,
      llmHealthChecker: llmStub.health,
      onDecision: (d) => decisions.push(d),
      skipTwilioStartupCheck: true,
      startServer: false,
      startPolling: false
    });

    try {
      await appRunner.pollNow();

      const state = appRunner.ctx.stateManager.getState();
      const processedCount = Object.keys(state.processed || {}).length;

      assert.ok(state.stats.gmail.last_poll_at > 0, 'should have performed a Gmail poll');
      assert.ok(state.stats.gmail.last_ok_at > 0, 'Gmail poll should succeed');
      assert.ok(!state.stats.gmail.last_error, `Gmail should not report errors (last_error=${state.stats.gmail.last_error})`);
      assert.strictEqual(
        decisions.length,
        processedCount,
        `should have one decision per processed email (decisions=${decisions.length}, processed=${processedCount})`
      );
    } finally {
      await appRunner.stop();
      await cleanupFile(statePath);
    }
  }
);
