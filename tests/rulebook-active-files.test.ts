import assert from 'node:assert/strict';
import test from 'node:test';
import { selectActiveRulebookSources } from '../src/features/referee/rulebook/activeFiles.ts';
const url = (key: string) => `https://r2/${key}`;

test('more than five same-season files all reach request inventory', () => {
  const objects = Array.from({ length: 7 }, (_, index) => ({ Key: `fll-rules/UNEARTHED-${index + 1}.pdf` }));
  assert.equal(selectActiveRulebookSources(objects, 'UNEARTHED', url).length, 7);
});
test('unrelated seasons are excluded', () => assert.deepEqual(selectActiveRulebookSources([{ Key: 'fll-rules/UNEARTHED-guide.pdf' }, { Key: 'fll-rules/SUBMERGED-guide.pdf' }], 'UNEARTHED', url).map(file => file.name), ['UNEARTHED-guide.pdf']));
test('duplicates are removed and order is deterministic', () => assert.deepEqual(selectActiveRulebookSources([{ Key: 'fll-rules/UNEARTHED-z.txt' }, { Key: 'fll-rules/UNEARTHED-a.pdf' }, { Key: 'fll-rules/UNEARTHED-z.txt' }], 'UNEARTHED', url).map(file => file.name), ['UNEARTHED-a.pdf', 'UNEARTHED-z.txt']));
test('mixed PDF and text from active season are retained', () => assert.equal(selectActiveRulebookSources([{ Key: 'fll-rules/UNEARTHED-guide.pdf' }, { Key: 'fll-rules/UNEARTHED-updates.md' }], 'UNEARTHED', url).length, 2));
test('generic active artifacts stay included while known foreign seasons are excluded', () => assert.deepEqual(selectActiveRulebookSources([{ Key: 'fll-rules/updates.pdf' }, { Key: 'fll-rules/UNEARTHED-guide.pdf' }, { Key: 'fll-rules/SUBMERGED-guide.pdf' }], 'UNEARTHED', url).map(file => file.name), ['UNEARTHED-guide.pdf', 'updates.pdf']));
