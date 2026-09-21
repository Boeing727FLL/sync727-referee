import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import LandingPage, { hasSavedSession } from '../src/pages/LandingPage.tsx';

test('hasSavedSession is false with empty storage, true with a saved auth marker', () => {
  localStorage.clear();
  assert.equal(hasSavedSession(), false);
  localStorage.setItem('auth_user', '{"uid":"u1"}');
  assert.equal(hasSavedSession(), true);
  localStorage.clear();
});

test('hasSavedSession detects a persisted firebase auth user key', () => {
  localStorage.clear();
  localStorage.setItem('firebase:authUser:abc123:[DEFAULT]', '{}');
  assert.equal(hasSavedSession(), true);
  localStorage.clear();
});

test('LandingPage opens the login stage in-page for signed-out visitors and sends returning users straight to chat', () => {
  const seen: string[] = [];
  localStorage.clear();
  const first = render(React.createElement(LandingPage, { onNavigate: (to: string) => seen.push(to) }));
  fireEvent.click(first.getByRole('button'));
  // No route change: the intro flips to its login stage on the same page.
  // (The stage itself mounts Firebase — covered by browser harness, not node.)
  assert.deepEqual(seen, []);
  assert.ok(first.container.querySelector('[data-mode="login"]'), 'intro should flip to login mode');
  first.unmount();
  cleanup();

  localStorage.setItem('auth_user', '{"uid":"u1"}');
  const second = render(React.createElement(LandingPage, { onNavigate: (to: string) => seen.push(to) }));
  fireEvent.click(second.getByRole('button'));
  assert.deepEqual(seen, ['/app?enter=chat']);
  second.unmount();
  cleanup();
  localStorage.clear();
});
