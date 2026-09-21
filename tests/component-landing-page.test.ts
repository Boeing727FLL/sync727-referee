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

test('LandingPage sends signed-out visitors to /login and returning users straight to chat', () => {
  const seen: string[] = [];
  localStorage.clear();
  const first = render(React.createElement(LandingPage, { onNavigate: (to: string) => seen.push(to) }));
  fireEvent.click(first.getByRole('button'));
  assert.deepEqual(seen, ['/login']);
  first.unmount();
  cleanup();

  localStorage.setItem('auth_user', '{"uid":"u1"}');
  const second = render(React.createElement(LandingPage, { onNavigate: (to: string) => seen.push(to) }));
  fireEvent.click(second.getByRole('button'));
  assert.deepEqual(seen, ['/login', '/app?enter=chat']);
  second.unmount();
  cleanup();
  localStorage.clear();
});
