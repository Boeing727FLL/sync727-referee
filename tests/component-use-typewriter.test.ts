import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useTypewriter } from '../src/features/referee/chat/useTypewriter.ts';
import { TYPEWRITER_TICK_MS } from '../src/features/referee/config.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('typewriter stays at zero while not ready', async () => {
  const { result, unmount } = renderHook(() =>
    useTypewriter({ ready: false, chatStarted: true, loading: false, onFinished: () => {} })
  );
  act(() => { result.current.targetRef.current = 4; });
  await sleep(TYPEWRITER_TICK_MS * 4);
  assert.equal(result.current.count, 0);
  unmount();
  cleanup();
});

test('typewriter advances toward the target and reports finish', async () => {
  let finished = 0;
  const { result, unmount } = renderHook(() =>
    useTypewriter({ ready: true, chatStarted: true, loading: false, onFinished: () => { finished += 1; } })
  );
  act(() => {
    result.current.targetRef.current = 5;
    result.current.setRendering(true);
  });
  await sleep(TYPEWRITER_TICK_MS * 12);
  assert.equal(result.current.count, 5);
  assert.equal(result.current.rendering, false);
  assert.ok(finished >= 1, 'onFinished fired when the text fully rendered');
  unmount();
  cleanup();
});

test('finish() reveals everything at once and stops the animation', () => {
  let finished = 0;
  const { result, unmount } = renderHook(() =>
    useTypewriter({ ready: true, chatStarted: true, loading: false, onFinished: () => { finished += 1; } })
  );
  act(() => {
    result.current.targetRef.current = 30;
    result.current.setRendering(true);
    result.current.finish();
  });
  assert.equal(result.current.count, 30);
  assert.equal(result.current.rendering, false);
  unmount();
  cleanup();
});
