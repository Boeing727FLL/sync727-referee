import assert from 'node:assert/strict';
import test from 'node:test';
import { stripThinkBlocks } from '../src/features/referee/chat/text.ts';
import { buildMessageView } from '../src/features/referee/chat/messageView.ts';
import { finalizeModelResponse, resolveResponseOutcome } from '../src/features/referee/chat/finalizeResponse.ts';
import { applyStopToMessages, hasVisibleAnswer } from '../src/features/referee/chat/stopResponse.ts';
import type { ChatMessage } from '../src/features/referee/types.ts';

const COMM = 'COMM_ERROR';
const question: ChatMessage = { role: 'user', text: 'כמה מנועים מותר לשים על הרובוט?' };

// The exact leaked shape Yuval reported: a literal <think> whose Hebrew
// internal analysis became the visible chat output.
const YUVAL_LEAK = `<think>
1. ניתוח בקשת המשתמש:
- המשתמש מבקש לקבל את התשובה הסופית לשאלה "כמה מנועים מותר לשים על הרובוט?" בטון ישיר, מקצועי, ידידותי ומעודד, כמו שופט ליד שולחן התחרות.
- חובה להקפיד ללא שפה משפטית/פורמלית מדי (ללא "פסק הדין הסופי" וכדומה).
- ללא סימ`;

test("an unclosed think block (Yuval's exact leak) strips to nothing", () => {
  assert.equal(stripThinkBlocks(YUVAL_LEAK), '');
  assert.equal(hasVisibleAnswer(YUVAL_LEAK), false);
});

test('unclosed think after a real answer keeps only the answer', () => {
  assert.equal(stripThinkBlocks(`מותר עד 4 מנועים. ${YUVAL_LEAK}`), 'מותר עד 4 מנועים.');
});

test('a truncated stream ending mid-tag never shows the fragment', () => {
  assert.equal(stripThinkBlocks('מותר עד 4 מנועים</th'), 'מותר עד 4 מנועים');
  assert.equal(stripThinkBlocks('מותר עד 4 מנועים<'), 'מותר עד 4 מנועים');
  assert.equal(stripThinkBlocks('<think>ניתוח</thi'), '');
});

test('case and whitespace tag variants are stripped', () => {
  assert.equal(stripThinkBlocks('<THINK>ניתוח</THINK>התשובה'), 'התשובה');
  assert.equal(stripThinkBlocks('< think >ניתוח</ think >התשובה'), 'התשובה');
  assert.equal(stripThinkBlocks('<think>ניתוח</think >התשובה'), 'התשובה');
  assert.equal(stripThinkBlocks('<think>ניתוח</ think>התשובה'), 'התשובה');
});

test('an orphaned closing tag hides the reasoning before it', () => {
  assert.equal(stripThinkBlocks('ניתוח פנימי של המודל</think>התשובה הסופית'), 'התשובה הסופית');
});

test('a retried stream concatenated onto a stale partial think never leaks', () => {
  const retried = '<think>ניתוח חלקי שנקטע<think>ניתוח מלא</think>התשובה הסופית';
  assert.equal(stripThinkBlocks(retried), 'התשובה הסופית');
});

test('multiple think blocks are all stripped', () => {
  assert.equal(stripThinkBlocks('<think>א</think>חלק אחד<think>ב</think>חלק שני'), 'חלק אחדחלק שני');
});

const viewOptions = (overrides: Partial<Parameters<typeof buildMessageView>[2]> = {}) => ({
  lastIndex: 1,
  loading: false,
  typewriterReady: true,
  typewriterCount: 100,
  typewriterTarget: 100,
  chatStarted: true,
  stopped: false,
  ...overrides,
});

test('the rendered answer never contains think markup or analysis', () => {
  const message: ChatMessage = { role: 'model', text: YUVAL_LEAK };
  const view = buildMessageView(message, 1, viewOptions());
  assert.equal(view.thinking, false);
  assert.equal(view.text.includes('<think>'), false);
  assert.equal(view.text.includes('ניתוח בקשת המשתמש'), false);
});

test('a closed think block followed by the answer renders only the answer', () => {
  const message: ChatMessage = { role: 'model', text: '<think>ניתוח פנימי</think>מותר לשים עד 4 מנועים על הרובוט.' };
  const view = buildMessageView(message, 1, viewOptions());
  assert.equal(view.text, 'מותר לשים עד 4 מנועים על הרובוט.');
});

test('while loading, an open think block is the thinking bubble, not an answer', () => {
  const message: ChatMessage = { role: 'model', text: YUVAL_LEAK };
  const view = buildMessageView(message, 1, viewOptions({ loading: true }));
  assert.equal(view.thinking, true);
  assert.equal(view.thinkContent.includes('ניתוח בקשת המשתמש'), true);
});

test("outcome maps Yuval's think-only leak to the clean failure, never the markup", () => {
  const o = resolveResponseOutcome(YUVAL_LEAK, COMM);
  assert.equal(o.answered, false);
  assert.equal(o.displayText, COMM);
  assert.equal(o.logAnswer, COMM);
});

test('finalize replaces the leaked think-only bubble with the clean failure', () => {
  const prev: ChatMessage[] = [question, { role: 'model', text: YUVAL_LEAK }];
  const next = finalizeModelResponse(prev, YUVAL_LEAK, COMM);
  assert.deepEqual(next, [question, { role: 'model', text: COMM }]);
});

test('error/stop cleanup drops a partial bubble with variant think tags', () => {
  const prev: ChatMessage[] = [question, { role: 'model', text: '<THINK>ניתוח חלקי' }];
  assert.deepEqual(applyStopToMessages(prev), [question]);
});
