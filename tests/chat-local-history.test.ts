import assert from 'node:assert/strict';
import test from 'node:test';
import { isChatStateEmpty,
  HISTORY_MESSAGE_LIMIT,
  TEXT_CHAR_LIMIT,
  parseChatState,
  serializeChatState,
} from '../src/features/referee/chat/localHistory.ts';
import type { ChatMessage } from '../src/features/referee/types.ts';

test('serialize keeps only the most recent messages within the bound', () => {
  const messages: ChatMessage[] = Array.from({ length: HISTORY_MESSAGE_LIMIT + 10 }, (_, i) => ({ role: 'user', text: `m${i}` }));
  const out = serializeChatState({ messages, draft: '', replyTo: null });
  assert.equal(out.messages.length, HISTORY_MESSAGE_LIMIT);
  assert.equal(out.messages[0].text, 'm10');
});

test('serialize strips attachments and progress flags, keeps quotes', () => {
  const out = serializeChatState({
    messages: [
      { role: 'user', text: 'עם תמונה', files: [{ url: 'blob:x', key: 'a.png' }], quote: 'ציטוט' },
      { role: 'model', text: 'מעבד...', isProgress: true },
    ],
    draft: 'טיוטה',
    replyTo: { text: 'הקשר' },
  });
  assert.deepEqual(out.messages[0], { role: 'user', text: 'עם תמונה', quote: 'ציטוט' });
  assert.deepEqual(out.messages[1], { role: 'model', text: 'מעבד...' });
  assert.equal(out.draft, 'טיוטה');
  assert.deepEqual(out.replyTo, { text: 'הקשר' });
});

test('serialize caps oversized text', () => {
  const big = 'x'.repeat(TEXT_CHAR_LIMIT + 100);
  const out = serializeChatState({ messages: [{ role: 'user', text: big }], draft: big, replyTo: { text: big } });
  assert.equal(out.messages[0].text.length, TEXT_CHAR_LIMIT);
  assert.equal(out.draft.length, TEXT_CHAR_LIMIT);
  assert.equal(out.replyTo?.text.length, TEXT_CHAR_LIMIT);
});

test('parse round-trips serialized state', () => {
  const original = serializeChatState({
    messages: [{ role: 'user', text: 'שאלה' }, { role: 'model', text: 'תשובה' }],
    draft: 'חצי משפט',
    replyTo: null,
  });
  const back = parseChatState(JSON.stringify(original));
  assert.deepEqual(back, original);
});

test('parse rejects corrupt and wrong-shaped payloads', () => {
  assert.equal(parseChatState(null), null);
  assert.equal(parseChatState('not json'), null);
  assert.equal(parseChatState('{"messages":"nope"}'), null);
  assert.equal(parseChatState('{"messages":[{"role":"admin","text":"x"}]}'), null);
});

test('empty chat state is recognized so sign-out does not resurrect a cleared record', () => {
  assert.equal(isChatStateEmpty({ messages: [], draft: '', replyTo: null }), true);
  assert.equal(isChatStateEmpty({ messages: [{ role: 'user', text: 'שאלה' }], draft: '', replyTo: null }), false);
  assert.equal(isChatStateEmpty({ messages: [], draft: 'טיוטה', replyTo: null }), false);
  assert.equal(isChatStateEmpty({ messages: [], draft: '', replyTo: { text: 'ציטוט' } }), false);
});
