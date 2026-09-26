/**
 * Admin analytics modal: owner gate, online presence streaming for
 * everyone, counters streaming only for the owner, and the two-tap
 * counter wipe with an honest failure line. Only module boundaries are
 * mocked (analytics, owner check); the modal and hook run for real.
 */
import './helpers/dom.ts';
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { LanguageProvider } from '../src/hooks/useLanguage.tsx';

// -- controllable module-boundary doubles ------------------------------------
let ownerSession = true;
let analyticsHandler: ((stats: unknown) => void) | null = null;
let resetQuestionsResult = true;
let resetQuestionsCalls = 0;

const STATS = { totalQuestions: 142, registeredUsers: 17, activeUsers: 9, avgPerUser: 15.8 };

mock.module('../src/lib/analytics.ts', {
  namedExports: {
    subscribeAnalytics: (cb: (stats: unknown) => void) => {
      analyticsHandler = cb;
      cb(STATS);
      return () => { analyticsHandler = null; };
    },
    onOnlineUsersChange: (cb: (count: number) => void) => {
      cb(4);
      return () => {};
    },
    resetQuestions: async () => { resetQuestionsCalls += 1; return resetQuestionsResult; },
  },
});
mock.module('../src/lib/owner.ts', {
  namedExports: {
    OWNER_EMAIL: 'boeing727.il@gmail.com',
    isCurrentUserOwner: () => ownerSession,
    isOwnerEmail: (email?: string | null) => !!email,
  },
});

const { default: AdminAnalyticsModal } = await import('../src/features/referee/ui/AdminAnalyticsModal.tsx');

function resetDoubles() {
  ownerSession = true;
  analyticsHandler = null;
  resetQuestionsResult = true;
  resetQuestionsCalls = 0;
}

function renderModal() {
  return render(React.createElement(LanguageProvider, null,
    React.createElement(AdminAnalyticsModal, { isOpen: true, onClose: () => {} })));
}

test('a non-owner sees the lock screen; counters never stream to them', async () => {
  resetDoubles();
  ownerSession = false;
  const utils = renderModal();
  await waitFor(() => utils.getByText('אזור מוגן'));
  assert.equal(analyticsHandler, null, 'no counters subscription for non-owners');
  assert.equal(utils.queryByText('שאלות שנשאלו'), null);
  utils.unmount();
  cleanup();
});

test('owner: counters and online presence render from the live streams', async () => {
  resetDoubles();
  const utils = renderModal();
  await waitFor(() => utils.getByText('שאלות שנשאלו'));
  utils.getByText('142');
  utils.getByText('17');
  utils.getByText('4'); // online now
  utils.getByText('15.8');
  utils.getByText('מתוך 9 פעילים');
  utils.unmount();
  cleanup();
});

test('counter wipe: first tap arms, second executes', async () => {
  resetDoubles();
  const utils = renderModal();
  await waitFor(() => utils.getByText('איפוס ספירה'));

  fireEvent.click(utils.getByText('איפוס ספירה'));
  await waitFor(() => utils.getByText('לחצו שוב לאישור'));
  assert.equal(resetQuestionsCalls, 0, 'no wipe before the confirming tap');

  fireEvent.click(utils.getByText('לחצו שוב לאישור'));
  await waitFor(() => assert.equal(resetQuestionsCalls, 1));
  assert.equal(utils.queryByText('איפוס הספירה נכשל. בדקו חיבור ונסו שוב.'), null);
  utils.unmount();
  cleanup();
});

test('a failed wipe shows the honest failure line', async () => {
  resetDoubles();
  resetQuestionsResult = false;
  const utils = renderModal();
  await waitFor(() => utils.getByText('איפוס ספירה'));
  fireEvent.click(utils.getByText('איפוס ספירה'));
  await waitFor(() => utils.getByText('לחצו שוב לאישור'));
  fireEvent.click(utils.getByText('לחצו שוב לאישור'));
  await waitFor(() => utils.getByText('איפוס הספירה נכשל. בדקו חיבור ונסו שוב.'));
  utils.unmount();
  cleanup();
});
