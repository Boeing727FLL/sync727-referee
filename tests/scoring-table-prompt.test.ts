import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/services/geminiPrompts.ts';

test('system prompt teaches how to read a mission scoring table', () => {
  const prompt = buildSystemPrompt('he', 'BIOGLOW');
  // Each scoring-table line is a separate entitlement; no invented per-item points.
  assert.match(prompt, /כל שורה בטבלה היא זכאות נפרדת/);
  assert.match(prompt, /אסור להמציא נקודות/);
  // Bonus lines pay only when every condition on the line holds.
  assert.match(prompt, /בונוס/);
  assert.match(prompt, /כל התנאים הכתובים באותה שורה מתקיימים יחד/);
  // The total must be constructible from the table and within the mission max.
  assert.match(prompt, /המקסימום האפשרי של המשימה/);
});
