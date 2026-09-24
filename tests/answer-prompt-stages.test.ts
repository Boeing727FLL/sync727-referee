import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_PROMPT } from '../src/services/geminiPrompts.ts';

test('single request keeps all three stages in order: draft -> critique -> final', () => {
  const draft = ANSWER_PROMPT.indexOf('שלב 1 - טיוטה');
  const critique = ANSWER_PROMPT.indexOf('שלב 2');
  const final = ANSWER_PROMPT.indexOf('שלב 3 - הפקת התשובה הסופית');
  assert.ok(draft >= 0 && critique > draft && final > critique);
  assert.match(ANSWER_PROMPT, /Adversarial Critique/);
  assert.match(ANSWER_PROMPT, /נסח בקצרה את מסקנות הביקורת והתיקונים שחובה לבצע/);
  assert.match(ANSWER_PROMPT, /ביקורת חזותית/);
  assert.match(ANSWER_PROMPT, /על בסיס הביקורת/);
});
