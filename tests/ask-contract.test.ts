import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASK_ABORTED, failureResult, isAbortResult, isFailureResult, unwrapFailure } from '../src/features/referee/ai/askContract.ts';
import { resolveResponseOutcome } from '../src/features/referee/chat/finalizeResponse.ts';

test('abort sentinel is the empty string and detected by isAbortResult', () => {
  assert.equal(ASK_ABORTED, '');
  assert.equal(isAbortResult(''), true);
  assert.equal(isAbortResult('תשובה'), false);
});

test('abort result is never an answered outcome', () => {
  const outcome = resolveResponseOutcome(ASK_ABORTED, 'COMM_ERROR');
  assert.equal(outcome.answered, false);
  assert.equal(outcome.displayText, 'COMM_ERROR');
});

test('think-only resolved text counts as a clean comm failure, never an answer', () => {
  const outcome = resolveResponseOutcome('<think>secret reasoning</think>', 'COMM_ERROR');
  assert.equal(outcome.answered, false);
  assert.equal(outcome.logAnswer, 'COMM_ERROR');
});

test('normal answers pass through answered with markup intact for display', () => {
  const outcome = resolveResponseOutcome('**תשובה** <think>hidden</think>', 'COMM_ERROR');
  assert.equal(outcome.answered, true);
  assert.equal(outcome.displayText, '**תשובה** <think>hidden</think>');
  assert.equal(outcome.logAnswer, '**תשובה**');
});

test('failure sentinel round-trips and never collides with plain text', () => {
  const marked = failureResult('תקלה זמנית');
  assert.equal(isFailureResult(marked), true);
  assert.equal(unwrapFailure(marked), 'תקלה זמנית');
  assert.equal(isFailureResult('תקלה זמנית'), false);
  assert.equal(unwrapFailure('תשובה רגילה'), 'תשובה רגילה');
  assert.equal(isAbortResult(marked), false);
});

test('failure result is never an answered outcome but keeps its honest text', () => {
  const outcome = resolveResponseOutcome(failureResult('השופט נתקל בתקלה'), 'COMM_ERROR');
  assert.equal(outcome.answered, false);
  assert.equal(outcome.displayText, 'השופט נתקל בתקלה');
  assert.equal(outcome.logAnswer, 'השופט נתקל בתקלה');
});
