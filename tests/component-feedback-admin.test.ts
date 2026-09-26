/**
 * Feedback admin modal: owner gate, live snapshot rendering with stats,
 * single delete (two-tap), chunked wipe-all (two-tap), and the global
 * popup-timer reset. Only module boundaries are mocked (RTDB SDK,
 * analytics query, referee flags, owner check); the modal, hook, views
 * and snapshot mappers run for real.
 */
import './helpers/dom.ts';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { LanguageProvider } from '../src/hooks/useLanguage.tsx';

// -- controllable module-boundary doubles ------------------------------------
let ownerSession = true;
let snapshotValue: unknown = null;
let onValueHandler: ((snap: { val: () => unknown }) => void) | null = null;
const removeCalls: string[] = [];
const updateCalls: Array<Record<string, null>> = [];
let resetFeedbackCalls = 0;

const ENTRIES = {
  f1: { rating: 5, improvements: 'להוסיף הסברים עם ציורים', uid: 'u1', createdAt: 1_727_000_000_000 },
  f2: { rating: 2, uid: 'u2', createdAt: 1_727_000_100_000 },
};

mock.module('firebase/database', {
  namedExports: {
    ref: (_db: unknown, path?: string) => ({ path }),
    onValue: (_query: unknown, cb: (snap: { val: () => unknown }) => void) => {
      onValueHandler = cb;
      return () => {};
    },
    get: async () => ({ val: () => snapshotValue }),
    remove: async (r: { path?: string }) => { removeCalls.push(r.path ?? ''); },
    update: async (_r: unknown, updates: Record<string, null>) => { updateCalls.push(updates); },
  },
});
mock.module('../src/lib/firebase/rtdb.ts', { namedExports: { rtdb: {} } });
mock.module('../src/lib/analytics.ts', {
  namedExports: { feedbackQuery: (limit = 300) => ({ feedbackQuery: limit }) },
});
mock.module('../src/lib/refereeFlags.ts', {
  namedExports: {
    resetFeedbackForAll: async () => { resetFeedbackCalls += 1; },
    subscribeMaintenance: () => () => {},
    subscribeFeedbackReset: () => () => {},
  },
});
mock.module('../src/lib/owner.ts', {
  namedExports: {
    OWNER_EMAIL: 'boeing727.il@gmail.com',
    isCurrentUserOwner: () => ownerSession,
    isOwnerEmail: (email?: string | null) => !!email,
  },
});

const { default: FeedbackAdminModal } = await import('../src/features/referee/ui/FeedbackAdminModal.tsx');

function resetDoubles() {
  ownerSession = true;
  snapshotValue = ENTRIES;
  onValueHandler = null;
  removeCalls.length = 0;
  updateCalls.length = 0;
  resetFeedbackCalls = 0;
}

function renderModal() {
  return render(React.createElement(LanguageProvider, null,
    React.createElement(FeedbackAdminModal, { isOpen: true, onClose: () => {} })));
}

async function openWithEntries(utils: ReturnType<typeof renderModal>) {
  await waitFor(() => assert.ok(onValueHandler, 'live subscription opened'));
  act(() => { onValueHandler!({ val: () => snapshotValue }); });
  await waitFor(() => assert.ok(utils.getAllByText('להוסיף הסברים עם ציורים').length >= 1));
}

test('a non-owner sees the lock screen and no subscription opens', async () => {
  resetDoubles();
  ownerSession = false;
  const utils = renderModal();
  await waitFor(() => utils.getByText('אזור מוגן'));
  assert.equal(onValueHandler, null);
  utils.unmount();
  cleanup();
});

test('owner: the live snapshot renders entries newest-first with stats', async () => {
  resetDoubles();
  const utils = renderModal();
  await openWithEntries(utils);
  // Stats: 2 entries, average (5+2)/2 = 3.5.
  utils.getByText('3.5');
  utils.getByLabelText('דירוג 2 מתוך 5');
  utils.unmount();
  cleanup();
});

test('single delete needs a second tap, then removes the exact path', async () => {
  resetDoubles();
  const utils = renderModal();
  await openWithEntries(utils);

  const deleteButtons = utils.getAllByTitle('מחק');
  fireEvent.click(deleteButtons[0]); // newest first = f2
  await waitFor(() => utils.getByText('ביטול'));
  assert.deepEqual(removeCalls, [], 'nothing removed before confirming');

  fireEvent.click(utils.getByText('מחק', { selector: 'button' }));
  await waitFor(() => assert.deepEqual(removeCalls, ['referee/feedback/f2']));
  utils.unmount();
  cleanup();
});

test('wipe-all is two taps and writes nulled paths in one chunk', async () => {
  resetDoubles();
  const utils = renderModal();
  await openWithEntries(utils);

  fireEvent.click(utils.getByText('מחק הכול'));
  await waitFor(() => utils.getByText('ביטול'));
  assert.deepEqual(updateCalls, [], 'nothing written before confirming');

  fireEvent.click(utils.getByText('מחק הכול'));
  await waitFor(() => assert.equal(updateCalls.length, 1));
  assert.deepEqual(updateCalls[0], {
    'referee/feedback/f2': null,
    'referee/feedback/f1': null,
  });
  utils.unmount();
  cleanup();
});

test('popup-timer reset fires the global flag and shows the confirmation', async () => {
  resetDoubles();
  const utils = renderModal();
  await openWithEntries(utils);
  fireEvent.click(utils.getByText('איפוס טיימר פידבק לכולם'));
  await waitFor(() => utils.getByText('טיימר הפידבק אופס לכולם. הטופס יקפוץ אחרי התשובה הבאה.'));
  assert.equal(resetFeedbackCalls, 1);
  utils.unmount();
  cleanup();
});
