/**
 * Journal unlock + data-loading regression test.
 *
 * The asker-name change (bd39bd9) referenced getDocs/collection/db without
 * importing them. Vite/esbuild strips types without checking, so the bundle
 * built cleanly and only crashed in production when the owner unlocked the
 * journal ("Can't find variable: getDocs"). Only a test that renders the
 * real modal, unlocks it, and runs its effects catches this class of
 * runtime-only failure. Mocks cover just the module boundaries (firebase
 * SDK, firebase singletons, analytics query, owner check); the modal,
 * model, snapshots and views all run for real.
 */
import './helpers/dom.ts';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

// -- controllable module-boundary doubles ------------------------------------
let ownerSession = true;
let onValueCalls = 0;
let onValueHandler: ((snap: { val: () => unknown }) => void) | null = null;
const getDocsQueries: unknown[] = [];
const accessWrites: unknown[] = [];
const PROFILES = [{ id: 'doc1', data: { uid: 'old_uid', name: 'יהונתן בן־עמי' } }];

mock.module('firebase/database', {
  namedExports: {
    onValue: (_query: unknown, cb: (snap: { val: () => unknown }) => void) => {
      onValueCalls += 1;
      onValueHandler = cb;
      return () => {};
    },
    remove: async () => {},
    ref: (...args: unknown[]) => ({ args }),
    update: async () => {},
    serverTimestamp: () => ({ '.sv': 'timestamp' }),
    // Server rule double: only the real code is accepted.
    set: async (_ref: unknown, value: { code?: string }) => {
      accessWrites.push(value);
      if (value?.code !== 'fLl') throw new Error('PERMISSION_DENIED');
    },
  },
});

mock.module('firebase/firestore', {
  namedExports: {
    collection: (_db: unknown, name: string) => ({ collection: name }),
    getDocs: async (query: unknown) => {
      getDocsQueries.push(query);
      return {
        forEach: (cb: (doc: { id: string; data: () => unknown }) => void) =>
          PROFILES.forEach((p) => cb({ id: p.id, data: () => p.data })),
      };
    },
  },
});

mock.module('../src/lib/firebase/rtdb.ts', { namedExports: { rtdb: {} } });
mock.module('../src/lib/firebase/auth.ts', { namedExports: { auth: { currentUser: { uid: 'u_test' } } } });
mock.module('../src/lib/firebase/firestore.ts', { namedExports: { db: {} } });
mock.module('../src/lib/analytics.ts', {
  namedExports: { logsQuery: (limit = 200) => ({ logsQuery: limit }) },
});
mock.module('../src/lib/owner.ts', {
  namedExports: {
    OWNER_EMAIL: 'boeing727.il@gmail.com',
    isCurrentUserOwner: () => ownerSession,
    isOwnerEmail: (email?: string | null) => !!email,
  },
});

const { default: RefereeLogsModal } = await import('../src/components/RefereeLogsModal.tsx');

const NOW = 1_727_000_000_000;
const LOGS = {
  old1: { question: 'שאלה ישנה', answer: 'תשובה', uid: 'old_uid', createdAt: NOW - 1000 },
  new1: { question: 'שאלה חדשה', answer: 'תשובה', uid: 'u2', askerName: 'נועם לוי', createdAt: NOW },
};

function resetDoubles() {
  onValueCalls = 0;
  onValueHandler = null;
  getDocsQueries.length = 0;
}

function renderModal() {
  return render(React.createElement(RefereeLogsModal, { isOpen: true, onClose: () => {} }));
}

function unlockJournal(utils: ReturnType<typeof renderModal>, code = 'fLl') {
  fireEvent.change(utils.getByPlaceholderText('קוד גישה'), { target: { value: code } });
  fireEvent.click(utils.getByText('כניסה ליומן'));
}

test('wrong code keeps the journal locked and never touches the data path', async () => {
  resetDoubles();
  ownerSession = true;
  const utils = renderModal();
  unlockJournal(utils, 'wrong-code');
  await waitFor(() => utils.getByText('קוד שגוי, נסו שוב'));
  assert.equal(onValueCalls, 0, 'no subscription before unlock');
  assert.equal(getDocsQueries.length, 0, 'no users listing before unlock');
  utils.unmount();
  cleanup();
});

test('owner unlock loads entries and resolves asker names without crashing', async () => {
  resetDoubles();
  ownerSession = true;
  const utils = renderModal();

  unlockJournal(utils);

  // Data-loading path: the live RTDB subscription opens once the server
  // accepted the access record.
  await waitFor(() => assert.equal(onValueCalls, 1));
  assert.ok(onValueHandler, 'onValue handler captured');

  act(() => {
    onValueHandler!({ val: () => LOGS });
  });

  // The new entry shows its stored snapshot name — this also proves
  // logEntries keeps askerName on the read path.
  await waitFor(() => utils.getByText('נועם לוי'));

  // Owner name-join path: getDocs must be reachable through a real import
  // (the production crash was a ReferenceError right here).
  await act(async () => {});
  assert.equal(getDocsQueries.length, 1);
  assert.deepEqual(getDocsQueries[0], { collection: 'users' });
  await waitFor(() => utils.getByText('יהונתן בן־עמי'));

  utils.unmount();
  cleanup();
});

test('non-owner unlock keeps read-only access and never lists user profiles', async () => {
  resetDoubles();
  ownerSession = false;
  const utils = renderModal();

  unlockJournal(utils);
  await waitFor(() => assert.equal(onValueCalls, 1));

  act(() => {
    onValueHandler!({ val: () => LOGS });
  });

  // Reading works; the stored snapshot name still shows, the uid-only entry
  // falls back cleanly, and the Firestore users listing is never requested.
  await waitFor(() => utils.getByText('נועם לוי'));
  await waitFor(() => utils.getByText('משתמש לא זמין'));
  await act(async () => {});
  assert.equal(getDocsQueries.length, 0, 'non-owner viewers must not list users');

  utils.unmount();
  cleanup();
});
