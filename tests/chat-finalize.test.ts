import assert from 'node:assert/strict';
import test from 'node:test';
import { failureResult } from '../src/features/referee/ai/askContract.ts';
import { finalizeModelResponse, resolveResponseOutcome } from '../src/features/referee/chat/finalizeResponse.ts';
import type { ChatMessage } from '../src/features/referee/types.ts';

const COMM = 'COMM_ERROR';
const question: ChatMessage = { role: 'user', text: 'שאלה' };

test('a normal answer logs stripped text and displays the full response', () => {
  const o = resolveResponseOutcome('<think>reasoning</think>התשובה', COMM);
  assert.equal(o.answered, true);
  assert.equal(o.logAnswer, 'התשובה');
  assert.equal(o.displayText, '<think>reasoning</think>התשובה');
});

test('think-only output maps to the clean failure and never leaks think markup', () => {
  const o = resolveResponseOutcome('<think>private reasoning</think>', COMM);
  assert.equal(o.answered, false);
  assert.equal(o.logAnswer, COMM);
  assert.equal(o.displayText, COMM);
  assert.ok(!o.logAnswer.includes('<think>'));
});

test('finalize replaces a streamed think-only bubble with the clean failure', () => {
  const prev: ChatMessage[] = [question, { role: 'model', text: '<think>partial thinking' }];
  const next = finalizeModelResponse(prev, '<think>only thinking</think>', COMM);
  assert.deepEqual(next, [question, { role: 'model', text: COMM }]);
});

test('finalize appends the clean failure when nothing streamed at all', () => {
  const next = finalizeModelResponse([question], '', COMM);
  assert.deepEqual(next, [question, { role: 'model', text: COMM }]);
});

test('finalize keeps a streamed bubble that already holds the answer', () => {
  const streamed: ChatMessage = { role: 'model', text: '<think>x</think>תשובה מלאה' };
  const next = finalizeModelResponse([question, streamed], '<think>x</think>תשובה מלאה', COMM);
  assert.deepEqual(next, [question, streamed]);
});

test('safeUserFacingError keeps Hebrew service messages and hides raw technical text', async () => {
  const { safeUserFacingError } = await import('../src/features/referee/chat/userFacingError.ts');
  assert.equal(safeUserFacingError(new Error('השופט עמוס כרגע'), 'fallback'), 'השופט עמוס כרגע');
  assert.equal(safeUserFacingError(new Error('429 RESOURCE_EXHAUSTED: quota'), 'fallback'), 'fallback');
  assert.equal(safeUserFacingError(new Error('fetch failed'), 'fallback'), 'fallback');
  assert.equal(safeUserFacingError({}, 'fallback'), 'fallback');
  assert.equal(safeUserFacingError(null, 'fallback'), 'fallback');
});

test('a failure fallback displays its honest text but is never counted as an answer', () => {
  const o = resolveResponseOutcome(failureResult('תקלה זמנית'), COMM);
  assert.equal(o.answered, false);
  assert.equal(o.displayText, 'תקלה זמנית');
  assert.equal(o.logAnswer, 'תקלה זמנית');
});

test('finalize appends failure text when nothing streamed, without counting', () => {
  const next = finalizeModelResponse([question], failureResult('שגיאה'), COMM);
  assert.deepEqual(next, [question, { role: 'model', text: 'שגיאה' }]);
});

test('finalize replaces a think-only bubble with the failure text, never the generic comm error', () => {
  const prev: ChatMessage[] = [question, { role: 'model', text: '<think>partial' }];
  const next = finalizeModelResponse(prev, failureResult('שגיאה'), COMM);
  assert.deepEqual(next, [question, { role: 'model', text: 'שגיאה' }]);
});
