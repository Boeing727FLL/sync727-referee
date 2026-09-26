import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import UserMenu from '../src/features/referee/ui/UserMenu.tsx';
import { translations, type LanguageCode } from '../src/locales/index.ts';

const heT = (key: string) => translations.he[key] || translations.en[key] || key;
const languages = [
  { code: 'he' as LanguageCode, native: 'עברית', english: 'Hebrew' },
  { code: 'en' as LanguageCode, native: 'English', english: 'English' },
];

function renderMenu(overrides: Partial<Parameters<typeof UserMenu>[0]> = {}) {
  const props = {
    displayUser: { name: 'יובל מרגלית', email: 'yuval@example.com' },
    gravatarPic: '',
    isOwner: false,
    t: heT,
    language: 'he' as LanguageCode,
    languages,
    setLanguage: () => {},
    isRTL: true,
    showToast: () => {},
    onLogout: () => {},
    onDeleteAccount: () => {},
    onPrivacy: () => {},
    onTerms: () => {},
    onSettings: () => {},
    onLogs: () => {},
    ...overrides,
  };
  return render(React.createElement(UserMenu, props));
}

test('the avatar button shows the two initials of the user name', () => {
  const { getByRole, unmount } = renderMenu();
  const avatar = getByRole('button');
  assert.equal(avatar.textContent, 'ימ');
  unmount();
  cleanup();
});

test('clicking the avatar opens the panel; logout fires the callback and closes it', async () => {
  let logouts = 0;
  const { getByRole, unmount } = renderMenu({ onLogout: () => { logouts += 1; } });
  fireEvent.click(getByRole('button'));
  const logoutRow = await waitFor(() => getByRole('button', { name: new RegExp(heT('auth.logout')) }));
  fireEvent.click(logoutRow);
  assert.equal(logouts, 1);
  await waitFor(() => {
    assert.equal(document.body.textContent?.includes(heT('auth.logout')), false);
  });
  unmount();
  cleanup();
});

test('the language row drills into the language sub-page and back', async () => {
  let picked: LanguageCode | null = null;
  const { getByRole, getAllByRole, unmount } = renderMenu({ setLanguage: (code) => { picked = code; } });
  fireEvent.click(getByRole('button'));
  const langRow = await waitFor(() => getByRole('button', { name: new RegExp(heT('common.language')) }));
  fireEvent.click(langRow);
  const english = await waitFor(() => getAllByRole('button').find(b => b.textContent?.includes('English')));
  assert.ok(english, 'English option listed on the language page');
  fireEvent.click(english!);
  assert.equal(picked, 'en');
  unmount();
  cleanup();
});

test('the settings row is owner-only', async () => {
  let settingsOpened = 0;
  const owner = renderMenu({ isOwner: true, onSettings: () => { settingsOpened += 1; } });
  fireEvent.click(owner.getByRole('button'));
  const settingsRow = await waitFor(() => owner.getByRole('button', { name: new RegExp(heT('common.settings')) }));
  fireEvent.click(settingsRow);
  assert.equal(settingsOpened, 1);
  owner.unmount();
  cleanup();

  const regular = renderMenu({ isOwner: false });
  fireEvent.click(regular.getByRole('button'));
  await waitFor(() => regular.getByRole('button', { name: new RegExp(heT('auth.logout')) }));
  assert.equal(document.body.textContent?.includes(heT('common.settings')), false);
  regular.unmount();
  cleanup();
});
