import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exitResetView,
  initialLoginView,
  isResetView,
  isSignUpView,
  showResetView,
  toggleSignMode,
} from '../src/features/auth/loginFlow.ts';

test('starts on sign-in', () => {
  assert.equal(initialLoginView, 'signin');
  assert.equal(isSignUpView(initialLoginView), false);
  assert.equal(isResetView(initialLoginView), false);
});

test('toggle flips sign-in <-> sign-up', () => {
  assert.equal(toggleSignMode('signin'), 'signup');
  assert.equal(toggleSignMode('signup'), 'signin');
});

test('toggle from reset goes to sign-up, never an illegal sign-up+reset combo', () => {
  const view = toggleSignMode(showResetView());
  assert.equal(view, 'signup');
  assert.equal(isResetView(view), false);
});

test('reset view opens and exits back to sign-in', () => {
  assert.equal(isResetView(showResetView()), true);
  assert.equal(exitResetView(), 'signin');
});
