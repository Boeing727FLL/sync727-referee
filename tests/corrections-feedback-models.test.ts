/** Pure model tests: judge-corrections line editing and feedback formatting/stats. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCorrections, serializeCorrections, correctionCount,
  visibleCorrections, addCorrection, editCorrection, deleteCorrection,
} from '../src/features/referee/corrections/model.ts';
import { formatTime, feedbackStats, type FeedbackEntry } from '../src/features/referee/feedback/model.ts';

// -- corrections -----------------------------------------------------------

test('parse/serialize round-trip; empty text parses to no lines', () => {
  assert.deepEqual(parseCorrections(''), []);
  assert.deepEqual(parseCorrections('א\nב\nג'), ['א', 'ב', 'ג']);
  assert.equal(serializeCorrections(['א', 'ב']), 'א\nב');
});

test('correctionCount ignores blank lines', () => {
  assert.equal(correctionCount(['א', '  ', '', 'ב']), 2);
  assert.equal(correctionCount([]), 0);
});

test('visibleCorrections keeps original indices under search', () => {
  const lines = ['ראשונה', 'אמצעית', 'אחרונה אמצעית'];
  assert.deepEqual(visibleCorrections(lines, ''), lines.map((line, index) => ({ line, index })));
  assert.deepEqual(visibleCorrections(lines, 'אמצעית'), [
    { line: 'אמצעית', index: 1 },
    { line: 'אחרונה אמצעית', index: 2 },
  ]);
  assert.deepEqual(visibleCorrections(lines, 'אמצעית   '), visibleCorrections(lines, 'אמצעית'));
});

test('addCorrection trims and rejects blanks; edit/delete are positional', () => {
  const lines = ['א', 'ב'];
  assert.deepEqual(addCorrection(lines, '  ג  '), ['א', 'ב', 'ג']);
  assert.equal(addCorrection(lines, '   '), lines, 'blank draft changes nothing');
  assert.deepEqual(editCorrection(lines, 1, 'שונה'), ['א', 'שונה']);
  assert.deepEqual(deleteCorrection(['א', 'ב', 'ג'], 1), ['א', 'ג']);
});

// -- feedback ----------------------------------------------------------------

test('formatTime survives garbage and formats real timestamps', () => {
  assert.equal(formatTime(null), '');
  assert.equal(formatTime(undefined), '');
  assert.equal(formatTime({}), '');
  assert.ok(formatTime(1_727_000_000_000).length > 0);
  assert.ok(formatTime({ seconds: 1_727_000_000 }).length > 0, 'Firestore-style {seconds} accepted');
  assert.ok(formatTime(1_727_000_000).length > 0, 'epoch seconds are scaled to ms');
});

test('feedbackStats: totals, average and high/low buckets', () => {
  const items: FeedbackEntry[] = [
    { id: '1', rating: 5 },
    { id: '2', rating: 4 },
    { id: '3', rating: 2 },
    { id: '4' }, // unrated: counts toward the total and (rating 0) the low bucket
  ];
  const stats = feedbackStats(items);
  assert.equal(stats.total, 4);
  assert.equal(stats.highCount, 2);
  assert.equal(stats.lowCount, 2, 'an unrated entry counts as 0, i.e. low');
  assert.ok(Math.abs(stats.avg - 11 / 4) < 1e-9);
  assert.deepEqual(feedbackStats([]), { total: 0, avg: 0, highCount: 0, lowCount: 0 });
});
