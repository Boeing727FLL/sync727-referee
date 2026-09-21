import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRulebookComplete, RulebookIncompleteError } from '../src/features/referee/rulebook/completeness.ts';

const pdf = (name = 'UNEARTHED.pdf') => ({ name, url: `https://r2/${name}` });
const blob = (text = 'ok', type = 'application/pdf') => new Blob([text], { type });
function deps(overrides: Record<string, unknown> = {}) {
  return {
    fetchSource: async () => blob(), countPdfPages: async () => 3,
    listRenderedPages: async () => [1, 2, 3], fetchRenderedPage: async () => blob('jpeg', 'image/jpeg'),
    renderPdfFallback: async () => [{ data: blob() }, { data: blob() }, { data: blob() }], ...overrides,
  } as any;
}

test('complete PDF page set passes', async () => assertRulebookComplete([pdf()], deps()));
test('missing rendered page fails closed', async () => assert.rejects(assertRulebookComplete([pdf()], deps({ listRenderedPages: async () => [1, 3] })), (e: unknown) => e instanceof RulebookIncompleteError && e.diagnostic.code === 'missing-page'));
test('failed source fetch fails closed', async () => assert.rejects(assertRulebookComplete([pdf()], deps({ fetchSource: async () => { throw new Error('503'); } })), /source-fetch/));
test('nonempty text rulebook passes without page rendering', async () => assertRulebookComplete([{ name: 'UNEARTHED-rules.txt', url: 'x' }], deps({ fetchSource: async () => blob('M01 scores 20', 'text/plain') })));
test('all files in one active season are checked', async () => { let checked = 0; await assertRulebookComplete([pdf('UNEARTHED-guide.pdf'), pdf('UNEARTHED-updates.pdf')], deps({ fetchSource: async () => { checked++; return blob(); } })); assert.equal(checked, 2); });
test('empty active listing fails closed', async () => assert.rejects(assertRulebookComplete([], deps()), /empty-listing/));
test('healthy full-PDF fallback passes only when no rendered set exists', async () => assertRulebookComplete([pdf()], deps({ listRenderedPages: async () => [] })));
test('incomplete fallback fails closed', async () => assert.rejects(assertRulebookComplete([pdf()], deps({ listRenderedPages: async () => [], renderPdfFallback: async () => [{ data: blob() }] })), /fallback-render/));
test('failed rendered page fetch is not filtered out', async () => assert.rejects(assertRulebookComplete([pdf()], deps({ fetchRenderedPage: async (_f: string, p: number) => { if (p === 2) throw new Error('404'); return blob(); } })), /page-fetch/));
