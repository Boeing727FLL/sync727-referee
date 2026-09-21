import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStop,
  beginSend,
  beginStream,
  completeStream,
  finishRender,
  initialRequestMachine,
  rejectPreflight,
  settle,
  type RequestMachine,
} from '../src/features/referee/chat/requestMachine.ts';

const streaming: RequestMachine = { phase: 'streaming', requestId: 3, stopHandled: false };

test('a send starts only from idle and bumps the request id', () => {
  const { next, started } = beginSend(initialRequestMachine);
  assert.equal(started, true);
  assert.deepEqual(next, { phase: 'preflight', requestId: 1, stopHandled: false });
  assert.equal(beginSend(next).started, false);
  assert.equal(beginSend(streaming).started, false);
});

test('the happy path walks preflight -> streaming -> rendering -> idle', () => {
  let m = beginSend(initialRequestMachine).next;
  m = beginStream(m);
  assert.equal(m.phase, 'streaming');
  m = completeStream(m);
  assert.equal(m.phase, 'rendering');
  assert.equal(settle(m).phase, 'rendering', 'the async tail settling must not end rendering');
  m = finishRender(m);
  assert.equal(m.phase, 'idle');
});

test('a preflight rejection returns to idle so the composer can resend', () => {
  const m = rejectPreflight(beginSend(initialRequestMachine).next);
  assert.equal(m.phase, 'idle');
  assert.equal(beginSend(m).started, true);
});

test('stop is idempotent and re-enables sending immediately', () => {
  const first = applyStop(streaming);
  assert.equal(first.tookEffect, true);
  assert.equal(first.next.phase, 'idle');
  assert.equal(first.next.stopHandled, true);
  const second = applyStop(first.next);
  assert.equal(second.tookEffect, false);
  assert.equal(beginSend(first.next).started, true);
});

test('a stopped request cannot complete or start rendering', () => {
  const stopped = applyStop(streaming).next;
  const sameId: RequestMachine = { ...stopped, phase: 'streaming' as const };
  assert.equal(completeStream({ ...sameId, stopHandled: true }).phase, 'streaming');
  assert.equal(beginStream({ phase: 'preflight', requestId: 4, stopHandled: true }).phase, 'preflight');
});

test('settle after an error mid-stream ends the request', () => {
  assert.equal(settle(streaming).phase, 'idle');
});

test('stop on an idle machine is a no-op', () => {
  const r = applyStop(initialRequestMachine);
  assert.equal(r.tookEffect, false);
  assert.equal(r.next, initialRequestMachine);
});
