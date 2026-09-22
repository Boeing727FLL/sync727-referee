/** Logs journal model: malformed server data must never crash the owner modal. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toDate, timeAgo, filterLogs, resolveAskerName, type LogEntry } from '../src/features/referee/logs/model.ts';

test('toDate survives garbage input', () => {
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate('not a date'), null);
  assert.equal(toDate({}), null);
  assert.equal(toDate(NaN), null);
  assert.ok(toDate(1790000000000) instanceof Date);
  assert.ok(toDate({ seconds: 1790000000 }) instanceof Date);
  assert.ok(toDate({ toDate: () => new Date(1790000000000) }) instanceof Date);
  assert.ok(toDate('2026-09-22T01:00:00Z') instanceof Date);
});

test('timeAgo returns empty for garbage and Hebrew buckets for real dates', () => {
  assert.equal(timeAgo('garbage'), '');
  assert.equal(timeAgo(null), '');
  const now = Date.now();
  assert.equal(timeAgo(now - 30_000, now), 'ממש עכשיו');
  assert.equal(timeAgo(now - 5 * 60_000, now), 'לפני 5 דקות');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), 'לפני 3 שעות');
});

test('filterLogs: a search over entries with non-string fields does not crash', () => {
  const logs = [
    { id: '1', question: 12345, answer: { weird: true }, season: null, createdAt: 'junk' } as unknown as LogEntry,
    { id: '2', question: 'מה השוויון?', answer: 'כולם שווים', createdAt: Date.now() },
    { id: '3' } as LogEntry, // no fields at all
  ];
  const numeric = filterLogs(logs, '123', 'all', true);
  assert.deepEqual(numeric.map(l => l.id), ['1'], 'numeric question is searchable via String()');
  const hebrew = filterLogs(logs, 'שוויון', 'all', true);
  assert.deepEqual(hebrew.map(l => l.id), ['2']);
  const all = filterLogs(logs, '', 'all', true);
  assert.equal(all.length, 3, 'empty query keeps every entry, however malformed');
});

test('filterLogs: time filter drops dateless and out-of-window entries', () => {
  const now = Date.now();
  const logs: LogEntry[] = [
    { id: 'fresh', question: 'a', createdAt: now - 60_000 },
    { id: 'old', question: 'b', createdAt: now - 10 * 86_400_000 },
    { id: 'dateless', question: 'c' },
  ];
  assert.deepEqual(filterLogs(logs, '', 'today', true, now).map(l => l.id), ['fresh']);
  assert.equal(filterLogs(logs, '', 'month', true, now).length, 2);
  assert.equal(filterLogs(logs, '', 'all', true, now).length, 3);
});

test('filterLogs: empty state and ordering', () => {
  assert.deepEqual(filterLogs([], 'x', 'all', true), []);
  const now = Date.now();
  const logs: LogEntry[] = [
    { id: 'newer', createdAt: now - 1_000 },
    { id: 'older', createdAt: now - 2_000 },
  ];
  assert.deepEqual(filterLogs(logs, '', 'all', true, now).map(l => l.id), ['newer', 'older']);
  assert.deepEqual(filterLogs(logs, '', 'all', false, now).map(l => l.id), ['older', 'newer']);
});

test('filterLogs: 10k-entry dataset filters correctly and fast enough', () => {
  const now = Date.now();
  const logs: LogEntry[] = Array.from({ length: 10_000 }, (_, i) => ({
    id: `log-${i}`, question: `question ${i}`, answer: 'טקסט תשובה', createdAt: now - i * 60_000,
  }));
  const start = performance.now();
  const hits = filterLogs(logs, 'question 9999', 'all', true, now);
  const elapsed = performance.now() - start;
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'log-9999');
  assert.ok(elapsed < 250, `10k filter took ${elapsed.toFixed(0)}ms`);
});


test('resolveAskerName covers new snapshots, historical profiles, anonymous and deleted users', () => {
  const names = { old_uid: 'שם היסטורי ארוך מאוד לבדיקה' };
  assert.equal(resolveAskerName({ id: 'new', uid: 'new_uid', askerName: 'שם שנשמר' }, names), 'שם שנשמר');
  assert.equal(resolveAskerName({ id: 'old', uid: 'old_uid' }, names), 'שם היסטורי ארוך מאוד לבדיקה');
  assert.equal(resolveAskerName({ id: 'anon', uid: 'anon' }, names), 'אורח');
  assert.equal(resolveAskerName({ id: 'missing' }, names), 'אורח');
  assert.equal(resolveAskerName({ id: 'deleted', uid: 'deleted_uid' }, names), 'משתמש לא זמין');
});

test('filterLogs searches a stored asker name without exposing identifiers', () => {
  const logs: LogEntry[] = [{ id: '1', question: 'שאלה', askerName: 'נועם לוי', uid: 'private_uid' }];
  assert.deepEqual(filterLogs(logs, 'נועם', 'all', true).map(log => log.id), ['1']);
  assert.deepEqual(filterLogs(logs, 'private_uid', 'all', true), []);
});


test('filterLogs searches names resolved for historical uid-only records', () => {
  const logs: LogEntry[] = [{ id: 'old', question: 'שאלה', uid: 'old_uid' }];
  assert.deepEqual(filterLogs(logs, 'יהונתן', 'all', true, Date.now(), { old_uid: 'יהונתן בן־עמי' }).map(log => log.id), ['old']);
});
