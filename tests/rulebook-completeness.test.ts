import assert from 'node:assert/strict';
import test from 'node:test';
import { assertListedPagesComplete, RulebookIncompleteError } from '../src/features/referee/rulebook/completeness.ts';

test('complete contiguous page set passes', () => {
  assertListedPagesComplete('UNEARTHED.pdf', 3, [1, 2, 3]);
});

test('missing middle page fails closed with file and code', () => {
  assert.throws(
    () => assertListedPagesComplete('UNEARTHED.pdf', 3, [1, 3]),
    (e: unknown) => e instanceof RulebookIncompleteError
      && e.diagnostic.code === 'missing-page'
      && e.diagnostic.file === 'UNEARTHED.pdf'
      && e.message.includes('Expected pages 1-3; listed [1, 3].'),
  );
});

test('short or long listing fails closed', () => {
  assert.throws(() => assertListedPagesComplete('f.pdf', 3, [1, 2]), /missing-page/);
  assert.throws(() => assertListedPagesComplete('f.pdf', 3, [1, 2, 3, 4]), /missing-page/);
});

test('out-of-order listing fails closed', () => {
  assert.throws(() => assertListedPagesComplete('f.pdf', 3, [2, 1, 3]), /missing-page/);
});

test('empty listing is not an error: legacy rulebooks render on the fly', () => {
  assertListedPagesComplete('legacy.pdf', 12, []);
});
