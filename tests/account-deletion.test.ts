import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginDeletingAuth,
  beginReauth,
  beginRemovingData,
  cancelDeletion,
  clearDeletionError,
  completeDeletion,
  failDeletion,
  initialAccountDeletion,
  isDeleting,
  isDeletionDialogOpen,
  openDeletionConfirm,
  rejectDeletion,
  setDeletionPassword,
} from '../src/features/referee/session/accountDeletion.ts';

test('opens idle; dialog open everywhere except idle', () => {
  assert.equal(isDeletionDialogOpen(initialAccountDeletion), false);
  assert.equal(isDeletionDialogOpen(openDeletionConfirm()), true);
});

test('cancel while confirming resets everything', () => {
  const s = setDeletionPassword(openDeletionConfirm(), 'secret');
  assert.deepEqual(cancelDeletion(s), initialAccountDeletion);
});

test('cancel mid-wipe is rejected: dialog stays open and busy', () => {
  const s = beginRemovingData(beginReauth(setDeletionPassword(openDeletionConfirm(), 'pw')));
  assert.equal(isDeleting(s), true);
  assert.equal(cancelDeletion(s), s);
});

test('validation rejection stays confirming with the error', () => {
  const s = rejectDeletion(openDeletionConfirm(), 'יש להזין סיסמה');
  assert.equal(s.stage, 'confirming');
  assert.equal(s.error, 'יש להזין סיסמה');
  assert.equal(isDeleting(s), false);
});

test('a failure at any working stage lands in the same legal state: open, not busy, error shown, password kept', () => {
  const pw = setDeletionPassword(openDeletionConfirm(), 'pw');
  for (const working of [beginReauth(pw), beginRemovingData(beginReauth(pw)), beginDeletingAuth(beginReauth(pw))]) {
    const failed = failDeletion(working, 'boom');
    assert.equal(failed.stage, 'confirming');
    assert.equal(failed.error, 'boom');
    assert.equal(failed.password, 'pw');
    assert.equal(isDeleting(failed), false);
    assert.equal(isDeletionDialogOpen(failed), true);
  }
});

test('completion resets to idle; clearError only clears the error', () => {
  assert.deepEqual(completeDeletion(), initialAccountDeletion);
  const s = clearDeletionError({ stage: 'confirming', password: 'x', error: 'e' });
  assert.equal(s.error, null);
  assert.equal(s.password, 'x');
});
