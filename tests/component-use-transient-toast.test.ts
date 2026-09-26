import './helpers/dom.ts';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useTransientToast } from '../src/features/referee/ui/useTransientToast.ts';
import { TOAST_MS } from '../src/features/referee/config.ts';

test('toast shows, then clears itself after TOAST_MS', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { result, unmount } = renderHook(() => useTransientToast());
    assert.equal(result.current.toast, null);
    act(() => { result.current.showToast('נשמר'); });
    assert.equal(result.current.toast, 'נשמר');
    act(() => { mock.timers.tick(TOAST_MS - 1); });
    assert.equal(result.current.toast, 'נשמר');
    act(() => { mock.timers.tick(1); });
    assert.equal(result.current.toast, null);
    unmount();
    cleanup();
  } finally {
    mock.timers.reset();
  }
});

test('a second toast replaces the first and restarts the clock', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { result, unmount } = renderHook(() => useTransientToast());
    act(() => { result.current.showToast('ראשון'); });
    act(() => { mock.timers.tick(TOAST_MS - 100); });
    act(() => { result.current.showToast('שני'); });
    // The first message's original deadline must not clear the second.
    act(() => { mock.timers.tick(200); });
    assert.equal(result.current.toast, 'שני');
    act(() => { mock.timers.tick(TOAST_MS); });
    assert.equal(result.current.toast, null);
    unmount();
    cleanup();
  } finally {
    mock.timers.reset();
  }
});

test('unmounting with a visible toast does not throw or update state after', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { result, unmount } = renderHook(() => useTransientToast());
    act(() => { result.current.showToast('מת'); });
    unmount();
    act(() => { mock.timers.tick(TOAST_MS * 2); });
    cleanup();
  } finally {
    mock.timers.reset();
  }
});
