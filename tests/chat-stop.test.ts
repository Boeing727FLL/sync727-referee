import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStopToMessages, dropInvisibleAnswer, hasVisibleAnswer, withoutStopNotes } from '../src/features/referee/chat/stopResponse.ts';
import { buildMessageView, typewriterLength } from '../src/features/referee/chat/messageView.ts';
import type { ChatMessage } from '../src/features/referee/types.ts';

const STOPPED_SENTENCE = 'הפעולה הופסקה על ידי המשתמש.';
const NOTE = 'עצרת את התשובה.';
const noteMsg: ChatMessage = { role: 'model', text: NOTE, stopped: true };
const question: ChatMessage = { role: 'user', text: 'מה הניקוד על משימה 3?' };

const viewOptions = (overrides: Partial<Parameters<typeof buildMessageView>[2]> = {}) => ({
  lastIndex: 1,
  loading: false,
  typewriterReady: true,
  typewriterCount: 0,
  typewriterTarget: 10,
  chatStarted: true,
  stopped: true,
  ...overrides,
});

test('hasVisibleAnswer: empty, whitespace and thinking-only text are not answers', () => {
  assert.equal(hasVisibleAnswer(''), false);
  assert.equal(hasVisibleAnswer('   \n '), false);
  assert.equal(hasVisibleAnswer('<think>reasoning in progress'), false);
  assert.equal(hasVisibleAnswer('<think>done</think>'), false);
  assert.equal(hasVisibleAnswer('<think>done</think> התשובה'), true);
  assert.equal(hasVisibleAnswer('תשובה חלקית'), true);
});

test('stop before the first token leaves a "you stopped it" note', () => {
  const after = applyStopToMessages([question], NOTE);
  assert.deepEqual(after, [question, noteMsg]);
});

test('stop during private thinking replaces the never-visible bubble with the note', () => {
  const before: ChatMessage[] = [question, { role: 'model', text: '<think>המודל חושב על חוקים' }];
  assert.deepEqual(applyStopToMessages(before, NOTE), [question, noteMsg]);
});

test('stop notes are never sent to the model as history', () => {
  const history: ChatMessage[] = [question, noteMsg, { role: 'user', text: 'שאלה חדשה' }];
  assert.deepEqual(withoutStopNotes(history), [question, { role: 'user', text: 'שאלה חדשה' }]);
  const clean: ChatMessage[] = [question, { role: 'model', text: 'תשובה' }];
  assert.equal(withoutStopNotes(clean), clean);
});

test('error cleanup drops an invisible bubble without adding a note', () => {
  assert.deepEqual(dropInvisibleAnswer([question, { role: 'model', text: '<think>x' }]), [question]);
  assert.deepEqual(dropInvisibleAnswer([question, noteMsg]), [question, noteMsg]);
});

test('stop mid-stream preserves the partial answer verbatim as the final message', () => {
  const partial = '**חוק R12:** לפי החוברת [עמוד 4], הרובוט חייב להיות בתוך הבסיס כשהשריקה';
  const before: ChatMessage[] = [question, { role: 'model', text: partial }];
  const after = applyStopToMessages(before, NOTE);
  assert.equal(after.length, 2);
  assert.equal(after[1].text, partial);
  assert.equal(after[1].text.includes(STOPPED_SENTENCE), false);
});

test('stop keeps a completed think block plus partial answer intact', () => {
  const text = '<think>בדיקת חוקים</think>התשובה החלקית **עם עיצוב**';
  const after = applyStopToMessages([question, { role: 'model', text }], NOTE);
  assert.equal(after[1].text, text);
});

test('stop is idempotent across rapid double clicks', () => {
  const partial = 'תשובה חלקית';
  const once = applyStopToMessages([question, { role: 'model', text: partial }], NOTE);
  const twice = applyStopToMessages(once, NOTE);
  assert.deepEqual(twice, once);
  const emptyOnce = applyStopToMessages([question], NOTE);
  assert.deepEqual(applyStopToMessages(emptyOnce, NOTE), emptyOnce);
});

test('stopped view reveals received-but-not-yet-typewritten text with no animation', () => {
  const fullText = 'מילה מילה מילה מילה מילה מילה מילה מילה מילה מילה';
  const target = typewriterLength(fullText);
  const message: ChatMessage = { role: 'model', text: fullText };
  const view = buildMessageView(message, 1, viewOptions({ typewriterCount: 3, typewriterTarget: target, stopped: true }));
  assert.equal(view.typewriting, false);
  assert.equal(view.liveAnswer, false);
  assert.equal(view.text, fullText);
});

test('control: without stop the typewriter still animates a partial window', () => {
  const fullText = 'מילה מילה מילה מילה מילה מילה מילה מילה מילה מילה';
  const target = typewriterLength(fullText);
  const message: ChatMessage = { role: 'model', text: fullText };
  const view = buildMessageView(message, 1, viewOptions({ typewriterCount: 3, typewriterTarget: target, stopped: false }));
  assert.equal(view.typewriting, true);
  assert.ok(fullText.startsWith(view.text));
  assert.notEqual(view.text, fullText);
});

test('completion racing stop: fully received answer stays complete and static', () => {
  const fullText = 'תשובה מלאה שהתקבלה רגע לפני העצירה';
  const target = typewriterLength(fullText);
  const message: ChatMessage = { role: 'model', text: fullText };
  const view = buildMessageView(message, 1, viewOptions({ typewriterCount: 1, typewriterTarget: target, stopped: true }));
  assert.equal(view.typewriting, false);
  assert.equal(view.text, fullText);
  // and a stopped message keeps working like a normal one in later views
  const historyView = buildMessageView(message, 0, viewOptions({ lastIndex: 2, stopped: false }));
  assert.equal(historyView.text, fullText);
});

test('the note appears only when no answer text was visible', () => {
  const scenarios: [ChatMessage[], boolean][] = [
    [[question], true],
    [[question, { role: 'model', text: '<think>thinking' }], true],
    [[question, { role: 'model', text: 'תשובה חלקית בעברית' }], false],
    [[question, { role: 'model', text: 'A partial English answer' }], false],
  ];
  for (const [before, expectNote] of scenarios) {
    const after = applyStopToMessages(before, NOTE);
    assert.equal(after.some(m => m.stopped), expectNote);
    assert.equal(after.some(m => m.text.includes(STOPPED_SENTENCE)), false);
    assert.equal(after[0], question);
  }
});
