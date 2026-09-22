/**
 * Long-conversation rendering: a 200-turn history with hostile content
 * (long Hebrew, unbroken URLs, code fences, think blocks) must keep its
 * structure: every row present, text preserved, word-wrapping classes on
 * both bubble kinds, and reasoning markup never visible.
 */
import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import ChatMessageRow from '../src/features/referee/chat/ChatMessageRow.tsx';
import { buildMessageView } from '../src/features/referee/chat/messageView.ts';
import type { ChatMessage } from '../src/features/referee/types.ts';

const heLong = 'השופט פסל את המטרה בגלל הפרעה על השוער וקצב המשחק נעצר לשניות ארוכות. '.repeat(6).trim();
const longUrl = 'https://example.com/' + 'verylongpathsegment/'.repeat(18);
const codeBlock = '```ts\nconst offside = attackers.filter(a => a.beyondLastDefender);\n```';
const thinkWrapped = '<think>private reasoning about the law 11 edge case</think>\n' + heLong;

function makeMessages(count: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    const user = i % 2 === 0;
    const variant = i % 5;
    const text = user
      ? (variant === 1 ? longUrl : variant === 3 ? heLong : `שאלה מספר ${i}`)
      : (variant === 0 ? thinkWrapped : variant === 2 ? codeBlock : variant === 4 ? longUrl : heLong);
    out.push({ role: user ? 'user' : 'model', text });
  }
  return out;
}

async function flush(times = 20) {
  for (let i = 0; i < times; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

test('a 200-message conversation renders every row with intact text and wrapping classes', async () => {
  const messages = makeMessages(200);
  const t = (k: string) => k;
  const rows = messages.map((message, index) => buildMessageView(message, index, {
    lastIndex: messages.length - 1,
    loading: false,
    typewriterReady: true,
    typewriterCount: 1e9,
    typewriterTarget: 1e9,
    chatStarted: true,
    stopped: false,
  }));
  const { container, unmount } = render(
    React.createElement(
      'div',
      null,
      rows.map((view) => React.createElement(ChatMessageRow, {
        key: view.index,
        view,
        userPicture: '',
        userName: 'יובל',
        onCopy: () => {},
        onReply: () => {},
        t,
      }))
    )
  );
  await flush();

  const body = container.textContent || '';
  // First and last user questions survived in full.
  assert.ok(body.includes('שאלה מספר 0'), 'first user message present');
  assert.ok(body.includes('שאלה מספר 190'), 'last user message present');
  // Hostile content rendered, not dropped.
  assert.ok(body.includes('verylongpathsegment'), 'long URL rendered');
  assert.ok(body.includes('beyondLastDefender'), 'code block rendered');
  // Reasoning markup never reaches the visible surface.
  assert.ok(!body.includes('<think>'), 'think tags stripped');
  assert.ok(!body.includes('private reasoning'), 'think content hidden');

  // Wrapping classes are present on both bubble kinds so long tokens wrap.
  const userBubbles = container.querySelectorAll('div.whitespace-pre-wrap.break-words');
  const modelBubbles = container.querySelectorAll('div.prose.break-words, div.prose-invert.break-words');
  assert.equal(userBubbles.length, 100, 'all user bubbles carry break-words');
  assert.ok(modelBubbles.length >= 100, 'all model bubbles carry break-words');

  // Every row produced its avatar cell: one per non-thinking row.
  const rowCount = container.querySelectorAll('div.w-8.h-8').length;
  assert.equal(rowCount, 200, '200 rows in the DOM');
  unmount();
  cleanup();
});

test('view derivation stays display-only: typewriter text truncates without mutating the message', () => {
  const message: ChatMessage = { role: 'model', text: heLong + ' ' + longUrl };
  const original = message.text;
  const view = buildMessageView(message, 0, {
    lastIndex: 0,
    loading: false,
    typewriterReady: true,
    typewriterCount: 4,
    typewriterTarget: 500,
    chatStarted: true,
    stopped: false,
  });
  assert.ok(view.typewriting, 'typewriter mode active');
  assert.ok(view.text.length < view.fullText.length, 'visible text is a prefix');
  assert.equal(message.text, original, 'source message untouched');
  cleanup();
});
