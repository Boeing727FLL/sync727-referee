import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import ConfirmationModal from '../src/features/referee/ui/ConfirmationModal.tsx';
import { LanguageProvider } from '../src/hooks/useLanguage.tsx';
import { translations } from '../src/locales/index.ts';

function renderConfirm(overrides: Partial<Parameters<typeof ConfirmationModal>[0]> = {}) {
  const props = {
    isOpen: true,
    onClose: () => {},
    onConfirm: () => {},
    title: 'מחיקת חשבון',
    message: 'הפעולה בלתי הפיכה',
    ...overrides,
  };
  return render(React.createElement(LanguageProvider, null, React.createElement(ConfirmationModal, props)));
}

test('renders title, message and both actions with translated defaults', () => {
  const { getByRole, getByText, unmount } = renderConfirm();
  getByText('מחיקת חשבון');
  getByText('הפעולה בלתי הפיכה');
  getByRole('button', { name: translations.he['common.confirm'] });
  getByRole('button', { name: translations.he['common.cancel'] });
  unmount();
  cleanup();
});

test('confirm fires onConfirm AND closes; cancel only closes', () => {
  let confirms = 0, closes = 0;
  const { getByRole, unmount } = renderConfirm({ onConfirm: () => { confirms += 1; }, onClose: () => { closes += 1; } });
  fireEvent.click(getByRole('button', { name: translations.he['common.confirm'] }));
  assert.equal(confirms, 1);
  assert.equal(closes, 1);
  unmount();
  cleanup();

  confirms = 0; closes = 0;
  const second = renderConfirm({ onConfirm: () => { confirms += 1; }, onClose: () => { closes += 1; } });
  fireEvent.click(second.getByRole('button', { name: translations.he['common.cancel'] }));
  assert.equal(confirms, 0);
  assert.equal(closes, 1);
  second.unmount();
  cleanup();
});

test('closed modal renders nothing', () => {
  const { queryByText, unmount } = renderConfirm({ isOpen: false });
  assert.equal(queryByText('מחיקת חשבון'), null);
  unmount();
  cleanup();
});
