/**
 * Owner settings modal: the control-room flows end to end - owner gate,
 * live maintenance flag, two-tap work-mode enable, one-tap disable,
 * two-tap question-counter wipe with honest outcome, and the global
 * feedback-timer reset. Only module boundaries are mocked (analytics,
 * referee flags, owner check); the modal and hook run for real.
 */
import './helpers/dom.ts';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LanguageProvider } from '../src/hooks/useLanguage.tsx';

// -- controllable module-boundary doubles ------------------------------------
let ownerSession = true;
let maintenanceNow = false;
const setMaintenanceCalls: boolean[] = [];
let resetQuestionsResult = true;
let resetQuestionsCalls = 0;
let resetFeedbackCalls = 0;

mock.module('../src/lib/analytics.ts', {
  namedExports: {
    resetQuestions: async () => { resetQuestionsCalls += 1; return resetQuestionsResult; },
  },
});
mock.module('../src/lib/refereeFlags.ts', {
  namedExports: {
    subscribeMaintenance: (cb: (on: boolean) => void) => {
      cb(maintenanceNow);
      return () => {};
    },
    setMaintenance: async (on: boolean) => { setMaintenanceCalls.push(on); },
    resetFeedbackForAll: async () => { resetFeedbackCalls += 1; },
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

const { default: SettingsModal } = await import('../src/features/referee/ui/SettingsModal.tsx');

function resetDoubles() {
  ownerSession = true;
  maintenanceNow = false;
  setMaintenanceCalls.length = 0;
  resetQuestionsResult = true;
  resetQuestionsCalls = 0;
  resetFeedbackCalls = 0;
}

function renderModal() {
  const props = {
    isOpen: true, onClose: () => {}, onOpenUpload: () => {},
    onOpenAnalytics: () => {}, onOpenCorrections: () => {},
    onOpenFeedback: () => {}, onOpenPrivacy: () => {},
  };
  return render(React.createElement(LanguageProvider, null, React.createElement(SettingsModal, props)));
}

test('a non-owner sees the lock screen and no live flag subscription opens', async () => {
  resetDoubles();
  ownerSession = false;
  const utils = renderModal();
  await waitFor(() => utils.getByText('אזור מוגן'));
  assert.equal(utils.queryByText('מצב עבודה'), null, 'no control room for non-owners');
  utils.unmount();
  cleanup();
});

test('owner: enabling work mode needs a second confirming tap', async () => {
  resetDoubles();
  const utils = renderModal();
  await waitFor(() => utils.getByText('מצב עבודה'));
  utils.getByText('כבוי');

  const toggle = utils.getByRole('switch', { name: 'מצב עבודה' });
  fireEvent.click(toggle);
  await waitFor(() => utils.getByText('הפעלה מנתקת את כל המשתמשים. לחצו שוב לאישור.'));
  assert.deepEqual(setMaintenanceCalls, [], 'nothing written before the confirming tap');

  fireEvent.click(utils.getByText('הפעלה מנתקת את כל המשתמשים. לחצו שוב לאישור.'));
  await waitFor(() => assert.deepEqual(setMaintenanceCalls, [true]));
  utils.unmount();
  cleanup();
});

test('owner: turning work mode off is a single tap, no confirmation', async () => {
  resetDoubles();
  maintenanceNow = true;
  const utils = renderModal();
  await waitFor(() => utils.getByText('פעיל'));
  fireEvent.click(utils.getByRole('switch', { name: 'מצב עבודה' }));
  await waitFor(() => assert.deepEqual(setMaintenanceCalls, [false]));
  assert.equal(utils.queryByText('הפעלה מנתקת את כל המשתמשים. לחצו שוב לאישור.'), null);
  utils.unmount();
  cleanup();
});

test('question-counter wipe: two taps, then an honest success line', async () => {
  resetDoubles();
  const utils = renderModal();
  await waitFor(() => utils.getByText('איפוס ספירת השאלות'));

  fireEvent.click(utils.getByText('איפוס ספירת השאלות'));
  await waitFor(() => utils.getByText('לחצו שוב לאישור האיפוס'));
  assert.equal(resetQuestionsCalls, 0, 'no wipe before the confirming tap');

  fireEvent.click(utils.getByText('לחצו שוב לאישור האיפוס'));
  await waitFor(() => utils.getByText('ספירת השאלות אופסה.'));
  assert.equal(resetQuestionsCalls, 1);
  utils.unmount();
  cleanup();
});

test('a failed counter wipe says so and writes nothing else', async () => {
  resetDoubles();
  resetQuestionsResult = false;
  const utils = renderModal();
  await waitFor(() => utils.getByText('איפוס ספירת השאלות'));
  fireEvent.click(utils.getByText('איפוס ספירת השאלות'));
  await waitFor(() => utils.getByText('לחצו שוב לאישור האיפוס'));
  fireEvent.click(utils.getByText('לחצו שוב לאישור האיפוס'));
  await waitFor(() => utils.getByText('האיפוס נכשל. בדקו חיבור ונסו שוב.'));
  utils.unmount();
  cleanup();
});

test('feedback-timer reset fires the global flag and confirms', async () => {
  resetDoubles();
  const utils = renderModal();
  await waitFor(() => utils.getByText('איפוס טיימר פידבק לכולם'));
  fireEvent.click(utils.getByText('איפוס טיימר פידבק לכולם'));
  await waitFor(() => utils.getByText('טיימר הפידבק אופס לכולם.'));
  assert.equal(resetFeedbackCalls, 1);
  utils.unmount();
  cleanup();
});
