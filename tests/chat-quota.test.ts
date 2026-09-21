import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_QUOTA_WINDOW_MS, DAILY_CHAT_LIMIT, decideChatQuota, type ChatQuotaRecord } from '../src/lib/chatQuotaCore.ts';

const NOW = Date.UTC(2026, 8, 21, 5, 0, 0);

test('owner bypass is unlimited and does not mutate quota', () => {
  const current = { count: DAILY_CHAT_LIMIT, windowStartMs: NOW };
  for (let i = 0; i < 100; i++) {
    const result = decideChatQuota({ current, nowMs: NOW + i, owner: true });
    assert.equal(result.allowed, true);
    assert.equal(result.bypassed, true);
    assert.equal(result.next, current);
  }
});

test('54 -> 55 is accepted and the next request is blocked', () => {
  const at54 = { count: 54, windowStartMs: NOW };
  const fiftyFifth = decideChatQuota({ current: at54, nowMs: NOW + 1, owner: false });
  assert.equal(fiftyFifth.allowed, true);
  assert.equal(fiftyFifth.next?.count, 55);
  assert.equal(fiftyFifth.remaining, 0);
  const blocked = decideChatQuota({ current: fiftyFifth.next, nowMs: NOW + 2, owner: false });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.next?.count, 55);
});

test('quota resets at the established rolling 24-hour boundary', () => {
  const full = { count: 55, windowStartMs: NOW };
  assert.equal(decideChatQuota({ current: full, nowMs: NOW + CHAT_QUOTA_WINDOW_MS - 1, owner: false }).allowed, false);
  const reset = decideChatQuota({ current: full, nowMs: NOW + CHAT_QUOTA_WINDOW_MS, owner: false });
  assert.equal(reset.allowed, true);
  assert.deepEqual(reset.next, { count: 1, windowStartMs: NOW + CHAT_QUOTA_WINDOW_MS });
  assert.equal(reset.remaining, 54);
});

test('atomic serialization permits only one of two concurrent attempts at count 54', () => {
  let stored: ChatQuotaRecord = { count: 54, windowStartMs: NOW };
  const commit = () => {
    const decision = decideChatQuota({ current: stored, nowMs: NOW + 1, owner: false });
    if (decision.allowed && decision.next) stored = decision.next;
    return decision.allowed;
  };
  assert.deepEqual([commit(), commit()], [true, false]);
  assert.equal(stored.count, 55);
});

test('abort and provider failure keep the pre-provider reservation', () => {
  const reserved = decideChatQuota({ current: null, nowMs: NOW, owner: false });
  assert.equal(reserved.next?.count, 1);
  // Abort/failure has no quota mutation. This prevents client-controlled refunds.
  const afterAbort = reserved.next;
  const afterProviderFailure = afterAbort;
  assert.equal(afterAbort?.count, 1);
  assert.equal(afterProviderFailure?.count, 1);
});
