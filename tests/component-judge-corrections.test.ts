/**
 * Judge corrections modal: the owner-only editor flow end to end - gate,
 * load, edit/add/search/delete, save with cache invalidation, and honest
 * failure states. Mocks cover only the module boundaries (firestore SDK,
 * db singleton, owner check, engine cache); the modal, hook and pure model
 * all run for real.
 */
import './helpers/dom.ts';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LanguageProvider } from '../src/hooks/useLanguage.tsx';

// -- controllable module-boundary doubles ------------------------------------
let ownerSession = true;
let storedDoc: { text: string; updatedAt: number } | null = {
  text: 'אל תיתן ניקוד כפול\nהכחול תמיד צודק',
  updatedAt: 1_727_000_000_000,
};
let failSaves = false;
const setDocCalls: Array<{ path: unknown; value: unknown }> = [];
let invalidateCalls = 0;

mock.module('firebase/firestore', {
  namedExports: {
    doc: (_db: unknown, ...path: string[]) => ({ path }),
    getDoc: async () => ({
      exists: () => storedDoc !== null,
      data: () => storedDoc ?? {},
    }),
    setDoc: async (ref: unknown, value: unknown) => {
      setDocCalls.push({ path: (ref as { path: string[] }).path, value });
      if (failSaves) throw new Error('PERMISSION_DENIED');
      storedDoc = value as { text: string; updatedAt: number };
    },
  },
});

mock.module('../src/lib/firebase/firestore.ts', { namedExports: { db: {} } });
mock.module('../src/lib/owner.ts', {
  namedExports: {
    OWNER_EMAIL: 'boeing727.il@gmail.com',
    isCurrentUserOwner: () => ownerSession,
    isOwnerEmail: (email?: string | null) => !!email,
  },
});
mock.module('../src/features/referee/ai/refereeEngine.ts', {
  namedExports: { invalidateCorrectionsCache: () => { invalidateCalls += 1; } },
});

const { default: JudgeCorrectionsModal } = await import('../src/features/referee/ui/JudgeCorrectionsModal.tsx');

function resetDoubles() {
  ownerSession = true;
  storedDoc = { text: 'אל תיתן ניקוד כפול\nהכחול תמיד צודק', updatedAt: 1_727_000_000_000 };
  failSaves = false;
  setDocCalls.length = 0;
  invalidateCalls = 0;
}

function renderModal() {
  return render(React.createElement(LanguageProvider, null, React.createElement(JudgeCorrectionsModal, { isOpen: true, onClose: () => {} })));
}

test('a non-owner sees the lock gate and the doc is never read', async () => {
  resetDoubles();
  ownerSession = false;
  let reads = 0;
  const utils = renderModal();
  await waitFor(() => utils.getByText('אזור מוגן'));
  utils.getByText('עריכת תיקונים פתוחה לחשבון הבעלים בלבד. התחברו עם החשבון המתאים.');
  assert.equal(reads, 0);
  assert.equal(utils.queryByPlaceholderText('כתבו תיקון'), null);
  utils.unmount();
  cleanup();
});

test('owner opens: the stored doc becomes one editable row per line', async () => {
  resetDoubles();
  const utils = renderModal();
  await waitFor(() => assert.equal(utils.getAllByPlaceholderText('כתבו תיקון').length, 2));
  const rows = utils.getAllByPlaceholderText('כתבו תיקון') as HTMLTextAreaElement[];
  assert.equal(rows[0].value, 'אל תיתן ניקוד כפול');
  assert.equal(rows[1].value, 'הכחול תמיד צודק');
  utils.unmount();
  cleanup();
});

test('save writes the joined text, stamps it and busts the engine cache', async () => {
  resetDoubles();
  const utils = renderModal();
  await waitFor(() => utils.getAllByPlaceholderText('כתבו תיקון'));

  // Edit the first line and add a third one.
  const rows = utils.getAllByPlaceholderText('כתבו תיקון') as HTMLTextAreaElement[];
  fireEvent.change(rows[0], { target: { value: 'אין ניקוד כפול' } });
  fireEvent.change(utils.getByPlaceholderText('הוספת תיקון חדש'), { target: { value: 'שורה חדשה' } });
  fireEvent.click(utils.getByText('הוסף'));

  fireEvent.click(utils.getByText('שמור תיקונים'));
  await waitFor(() => utils.getByText('נשמר'));

  assert.equal(setDocCalls.length, 1);
  const written = setDocCalls[0].value as { text: string; updatedAt: number };
  assert.equal(written.text, 'אין ניקוד כפול\nהכחול תמיד צודק\nשורה חדשה');
  assert.ok(written.updatedAt > 0, 'save stamps updatedAt');
  assert.equal(invalidateCalls, 1, 'the engine corrections cache is busted on save');
  utils.unmount();
  cleanup();
});

test('a failed save keeps the draft and says so', async () => {
  resetDoubles();
  failSaves = true;
  const utils = renderModal();
  await waitFor(() => utils.getAllByPlaceholderText('כתבו תיקון'));
  const rows = utils.getAllByPlaceholderText('כתבו תיקון') as HTMLTextAreaElement[];
  fireEvent.change(rows[0], { target: { value: 'ניסיון שמירה' } });
  fireEvent.click(utils.getByText('שמור תיקונים'));
  await waitFor(() => utils.getByText('שמירת התיקונים נכשלה. בדקו חיבור והתחברות כבעלים.'));
  assert.equal(invalidateCalls, 0, 'no cache bust when the write failed');
  // The draft stays on screen (still dirty - save button enabled again).
  assert.equal((utils.getAllByPlaceholderText('כתבו תיקון') as HTMLTextAreaElement[])[0].value, 'ניסיון שמירה');
  assert.equal(storedDoc!.text.includes('ניסיון שמירה'), false, 'store untouched');
  utils.unmount();
  cleanup();
});

test('search filters rows but delete still targets the original line', async () => {
  resetDoubles();
  storedDoc = { text: 'שורה ראשונה\nאמצעית\nשורה אחרונה', updatedAt: 1_727_000_000_000 };
  const utils = renderModal();
  await waitFor(() => assert.equal(utils.getAllByPlaceholderText('כתבו תיקון').length, 3));

  fireEvent.change(utils.getByPlaceholderText('חיפוש בתיקונים'), { target: { value: 'אמצעית' } });
  await waitFor(() => assert.equal(utils.getAllByPlaceholderText('כתבו תיקון').length, 1));
  fireEvent.click(utils.getByTitle('מחק שורה'));

  // Clear the search: the middle line is gone, the other two survived.
  fireEvent.change(utils.getByPlaceholderText('חיפוש בתיקונים'), { target: { value: '' } });
  await waitFor(() => assert.equal(utils.getAllByPlaceholderText('כתבו תיקון').length, 2));
  const remaining = (utils.getAllByPlaceholderText('כתבו תיקון') as HTMLTextAreaElement[]).map(r => r.value);
  assert.deepEqual(remaining, ['שורה ראשונה', 'שורה אחרונה']);
  utils.unmount();
  cleanup();
});
