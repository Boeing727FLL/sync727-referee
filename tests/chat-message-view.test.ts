import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessageView, typewriterLength } from '../src/features/referee/chat/messageView.ts';

const base = {
  lastIndex: 0,
  loading: false,
  typewriterReady: true,
  typewriterCount: 0,
  typewriterTarget: 0,
  chatStarted: true,
  stopped: false,
};

test('a stopped note is plain text: no typewriter, no stripping', () => {
  const view = buildMessageView({ role: 'model', text: 'נעצר $x\\rightarrow$', stopped: true }, 0, { ...base, typewriterTarget: 10 });
  assert.equal(view.text, 'נעצר $x\\rightarrow$');
  assert.equal(view.typewriting, false);
  assert.equal(view.liveAnswer, false);
});

test('think blocks never reach the visible text; closed blocks are not thinking', () => {
  const view = buildMessageView({ role: 'model', text: '<think>private</think>התשובה' }, 0, base);
  assert.equal(view.fullText, 'התשובה');
  assert.equal(view.text, 'התשובה');
  assert.equal(view.thinking, false);
  assert.equal(view.thinkContent, 'private');
});

test('an unclosed think block on the last loading message is thinking, with empty visible text', () => {
  const view = buildMessageView({ role: 'model', text: '<think>still reasoning' }, 0, { ...base, loading: true });
  assert.equal(view.thinking, true);
  assert.equal(view.thinkContent, 'still reasoning');
  assert.equal(view.fullText, '');
  // ...but only on the last message: history never shows the spinner state.
  const older = buildMessageView({ role: 'model', text: '<think>still reasoning' }, 0, { ...base, loading: true, lastIndex: 1 });
  assert.equal(older.thinking, false);
});

test('typewriter reveals word by word and reports liveAnswer', () => {
  const message = { role: 'model' as const, text: 'אחת שתיים שלוש ארבע' };
  const target = typewriterLength(message.text);
  assert.equal(target, 7); // words plus the whitespace separators
  const view = buildMessageView(message, 0, { ...base, typewriterCount: 3, typewriterTarget: target });
  assert.equal(view.typewriting, true);
  assert.equal(view.liveAnswer, true);
  assert.equal(view.text, 'אחת שתיים');
  const done = buildMessageView(message, 0, { ...base, typewriterCount: target, typewriterTarget: target });
  assert.equal(done.typewriting, false);
  assert.equal(done.text, message.text);
});

test('a stopped request freezes the typewriter', () => {
  const view = buildMessageView({ role: 'model', text: 'אחת שתיים שלוש' }, 0, { ...base, stopped: true, typewriterCount: 1, typewriterTarget: 5 });
  assert.equal(view.typewriting, false);
  assert.equal(view.text, 'אחת שתיים שלוש');
});

test('before the typewriter is ready the streamed text stays hidden once chat started', () => {
  const view = buildMessageView({ role: 'model', text: 'תשובה' }, 0, { ...base, typewriterReady: false });
  assert.equal(view.text, '');
  assert.equal(view.fullText, 'תשובה');
  // On the entry screens (chat not started) the text shows normally.
  const intro = buildMessageView({ role: 'model', text: 'תשובה' }, 0, { ...base, typewriterReady: false, chatStarted: false });
  assert.equal(intro.text, 'תשובה');
});

test('arrows and dollars normalize in the visible text of both roles', () => {
  const model = buildMessageView({ role: 'model', text: 'a \\rightarrow b $5' }, 0, base);
  assert.equal(model.fullText, 'a -> b 5');
  const user = buildMessageView({ role: 'user', text: 'x \\leftarrow y' }, 0, base);
  assert.equal(user.fullText, 'x <- y');
  // A user message never typewrites even on the last index.
  assert.equal(user.typewriting, false);
});
