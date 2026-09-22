/** Chunk-failure recovery: one auto-reload per chunk, then the error surfaces. */
import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importWithReload, resetChunkReloadMarkers, setReloadPageForTests } from '../src/lib/lazyWithReload.ts';

const failing = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));

function stubReload() {
  const state = { reloads: 0, restore: () => setReloadPageForTests(null) };
  setReloadPageForTests(() => { state.reloads++; });
  return state;
}

test('a failing chunk triggers exactly one reload, then rethrows on the next failure', async () => {
  resetChunkReloadMarkers();
  const state = stubReload();

  // First failure: reload once, stay pending (the page is navigating away).
  let settled = false;
  const first = importWithReload('test-chunk', failing).then(
    () => { settled = true; },
    () => { settled = true; },
  );
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(state.reloads, 1, 'one auto reload on first failure');
  assert.equal(settled, false, 'first failure stays pending while reloading');
  void first;

  // Second failure with the marker set: error must surface to the boundary.
  let caught: unknown = null;
  try { await importWithReload('test-chunk', failing); } catch (e) { caught = e; }
  assert.ok(caught instanceof Error, 'second failure rethrows');
  assert.equal(state.reloads, 1, 'no second reload');

  state.restore();
});

test('a healthy chunk resolves normally and leaves no marker', async () => {
  resetChunkReloadMarkers();
  const result = await importWithReload('ok-chunk', () => Promise.resolve({ default: 42 }));
  assert.deepEqual(result, { default: 42 });
  assert.equal(sessionStorage.getItem('chunk-reload:ok-chunk'), null);
});

test('a healthy load re-arms a marker left by an earlier recovered failure', async () => {
  resetChunkReloadMarkers();
  sessionStorage.setItem('chunk-reload:rearm-chunk', '1');
  await importWithReload('rearm-chunk', () => Promise.resolve({ default: 1 }));
  assert.equal(sessionStorage.getItem('chunk-reload:rearm-chunk'), null, 'marker cleared on success');
});
