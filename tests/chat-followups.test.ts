import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFollowUps, stripThinkBlocks } from '../src/features/referee/chat/text.ts';

const raw = '<think>private</think>התשובה כאן.\n<followups>\n- ומה אם הרובוט נתקע?\n2. זה משפיע על הניקוד?\nמה נחשב בתוך הבית?\nשאלה רביעית מיותרת?\n</followups>';

test('follow-up block never reaches the visible answer', () => {
  assert.equal(stripThinkBlocks(raw), 'התשובה כאן.');
  // Mid-stream: an unclosed block or a cut tag stays hidden too.
  assert.equal(stripThinkBlocks('תשובה\n<followups>\nומה'), 'תשובה');
  assert.equal(stripThinkBlocks('תשובה\n<follow'), 'תשובה');
});

test('extractFollowUps reads up to three clean questions only after the block closes', () => {
  assert.deepEqual(extractFollowUps(raw), ['ומה אם הרובוט נתקע?', 'זה משפיע על הניקוד?', 'מה נחשב בתוך הבית?']);
  assert.deepEqual(extractFollowUps('תשובה\n<followups>\nומה אם'), []);
  assert.deepEqual(extractFollowUps('תשובה בלי בלוק'), []);
});
