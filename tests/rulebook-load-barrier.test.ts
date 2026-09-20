import assert from 'node:assert/strict';
import test from 'node:test';
import { createRulebookLoadBarrier } from '../src/features/referee/rulebook/loadBarrier.ts';

test('the first question waits for a delayed initial rulebook listing', async () => {
  const barrier = createRulebookLoadBarrier<string[]>([]);
  let resolveList!: (files: string[]) => void;
  const list = barrier.load(() => new Promise(resolve => { resolveList = resolve; }));

  let assembled: string[] | undefined;
  const firstQuestion = barrier.ready().then(files => { assembled = files; });
  await Promise.resolve();
  assert.equal(assembled, undefined, 'request must not assemble without the rulebook');

  resolveList(['UNEARTHED.pdf']);
  await Promise.all([list, firstQuestion]);
  assert.deepEqual(assembled, ['UNEARTHED.pdf']);
});

test('an upload refresh replaces the stale snapshot before the next question', async () => {
  const barrier = createRulebookLoadBarrier(['SUBMERGED.pdf']);
  let resolveRefresh!: (files: string[]) => void;
  barrier.load(() => new Promise(resolve => { resolveRefresh = resolve; }));

  const nextQuestion = barrier.ready();
  resolveRefresh(['UNEARTHED.pdf', 'UNEARTHED_updates.pdf']);
  assert.deepEqual(await nextQuestion, ['UNEARTHED.pdf', 'UNEARTHED_updates.pdf']);
  assert.deepEqual(barrier.snapshot(), ['UNEARTHED.pdf', 'UNEARTHED_updates.pdf']);
});

test('a failed refresh rejects instead of silently serving stale rules', async () => {
  const barrier = createRulebookLoadBarrier(['SUBMERGED.pdf']);
  barrier.load(async () => { throw new Error('R2 unavailable'); });
  await assert.rejects(barrier.ready(), /R2 unavailable/);
  assert.deepEqual(barrier.snapshot(), ['SUBMERGED.pdf']);
});

test('concurrent callers share one list operation', async () => {
  const barrier = createRulebookLoadBarrier<string[]>([]);
  let calls = 0;
  const loader = async () => { calls++; return ['rules.pdf']; };
  await Promise.all([barrier.load(loader), barrier.load(loader), barrier.ready()]);
  assert.equal(calls, 1);
});

test('a question can wait for the whole upload and refresh transaction', async () => {
  const barrier = createRulebookLoadBarrier(['OLD.pdf']);
  let finishUpload!: () => void;
  const mutation = new Promise<void>(resolve => { finishUpload = resolve; });
  const requestFiles = (async () => {
    await mutation;
    return barrier.ready();
  })();
  barrier.replace(['NEW.pdf']);
  let settled = false;
  void requestFiles.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  finishUpload();
  assert.deepEqual(await requestFiles, ['NEW.pdf']);
});

test('a forced refresh queues behind an older in-flight listing', async () => {
  const barrier = createRulebookLoadBarrier<string[]>([]);
  let resolveOld!: (files: string[]) => void;
  const old = barrier.load(() => new Promise(resolve => { resolveOld = resolve; }));
  let refreshCalls = 0;
  const refreshed = barrier.refresh(async () => { refreshCalls++; return ['NEW.pdf']; });
  assert.equal(refreshCalls, 0);
  resolveOld(['OLD.pdf']);
  await old;
  assert.deepEqual(await refreshed, ['NEW.pdf']);
  assert.equal(refreshCalls, 1);
});
