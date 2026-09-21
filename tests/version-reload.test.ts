import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReloadForUpdate } from '../src/features/referee/ui/versionReload.ts';

test('reloads when the version changed and the app is idle', () => {
  assert.equal(shouldReloadForUpdate('1.0.0', '1.0.1', { busy: false, composerEmpty: true }), true);
});

test('defers while a request is streaming or the typewriter renders', () => {
  assert.equal(shouldReloadForUpdate('1.0.0', '1.0.1', { busy: true, composerEmpty: true }), false);
});

test('defers while the composer holds a draft', () => {
  assert.equal(shouldReloadForUpdate('1.0.0', '1.0.1', { busy: false, composerEmpty: false }), false);
});

test('ignores matching versions and empty version reports', () => {
  assert.equal(shouldReloadForUpdate('1.0.0', '1.0.0', { busy: false, composerEmpty: true }), false);
  assert.equal(shouldReloadForUpdate('', '1.0.1', { busy: false, composerEmpty: true }), false);
  assert.equal(shouldReloadForUpdate('1.0.0', '', { busy: false, composerEmpty: true }), false);
});
