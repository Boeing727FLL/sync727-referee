import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
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

test('LandingPage shows the auth card in-page for signed-out visitors and sends returning users to the disclaimer', () => {
  localStorage.clear();
  const first = render(React.createElement(LandingPage));
  // No route change: the landing stays mounted and shows the auth card view.
  assert.equal(first.container.querySelector('[data-stage]')?.getAttribute('data-stage'), 'landing');
  assert.equal(first.container.querySelector('[data-view]')?.getAttribute('data-view'), 'auth');
  first.unmount();
  cleanup();

  // Signed-in: the disclaimer view opens on the same page, never a navigation.
  localStorage.setItem('auth_user', '{"uid":"u1"}');
  const second = render(React.createElement(LandingPage));
  assert.equal(second.container.querySelector('[data-view]')?.getAttribute('data-view'), 'disclaimer');
  assert.ok(second.getByRole('button', { name: /./ }), 'confirm button present');
  second.unmount();
  cleanup();
  localStorage.clear();
});
