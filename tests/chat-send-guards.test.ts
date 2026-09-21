import assert from 'node:assert/strict';
import test from 'node:test';
import { decideSendPreflight, type GuardCopy } from '../src/features/referee/chat/sendGuards.ts';

const copy: GuardCopy = {
  rulebookLoadFailed: 'LOAD_FAILED',
  noRulebook: 'NO_RULEBOOK',
  genericRateLimited: 'RATE_LIMITED',
  quotaExhausted: 'QUOTA_EXHAUSTED',
  quotaUnavailable: 'QUOTA_UNAVAILABLE',
};

const ok = { rulebookCount: 3, clientLimit: { allowed: true }, quotaError: null };

test('all guards clear -> proceed', () => {
  assert.deepEqual(decideSendPreflight(ok, copy), { kind: 'proceed' });
});

test('no rulebook rejects before any rate check (never answer blind)', () => {
  const d = decideSendPreflight({ ...ok, rulebookCount: 0, clientLimit: { allowed: false } }, copy);
  assert.deepEqual(d, { kind: 'reject', notice: 'NO_RULEBOOK' });
});

test('client rate limit rejects with its own message, or the generic one', () => {
  assert.deepEqual(
    decideSendPreflight({ ...ok, clientLimit: { allowed: false, message: 'WAIT' } }, copy),
    { kind: 'reject', notice: 'WAIT' });
  assert.deepEqual(
    decideSendPreflight({ ...ok, clientLimit: { allowed: false } }, copy),
    { kind: 'reject', notice: 'RATE_LIMITED' });
});

test('quota errors reject: exhausted vs unavailable', () => {
  assert.deepEqual(
    decideSendPreflight({ ...ok, quotaError: { exhausted: true, resetAtMs: 123 } }, copy),
    { kind: 'reject', notice: 'QUOTA_EXHAUSTED' });
  assert.deepEqual(
    decideSendPreflight({ ...ok, quotaError: { exhausted: false } }, copy),
    { kind: 'reject', notice: 'QUOTA_UNAVAILABLE' });
});

test('guard order is fixed: rulebook, client limit, quota', () => {
  const d = decideSendPreflight(
    { rulebookCount: 0, clientLimit: { allowed: false }, quotaError: { exhausted: true } }, copy);
  assert.deepEqual(d, { kind: 'reject', notice: 'NO_RULEBOOK' });
});
