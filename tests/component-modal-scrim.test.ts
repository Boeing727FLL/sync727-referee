import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ModalScrim from '../src/features/referee/ui/ModalScrim.tsx';

function renderScrim(overrides: Partial<Parameters<typeof ModalScrim>[0]> = {}) {
  const props = {
    isOpen: true,
    isRTL: true,
    layerClass: 'z-[9999] modal-safe-3',
    children: React.createElement('div', { 'data-testid': 'sheet' }, 'sheet'),
    ...overrides,
  };
  return render(React.createElement(ModalScrim, props));
}

test('closed scrim renders nothing; open scrim renders the children', async () => {
  const closed = renderScrim({ isOpen: false });
  assert.equal(document.body.textContent, '');
  closed.unmount();
  cleanup();

  const open = renderScrim();
  assert.ok(open.getByTestId('sheet'));
  open.unmount();
  cleanup();
});

test('the scrim carries the layer classes, admin tint and direction', () => {
  const { container, unmount } = renderScrim({ admin: true });
  const scrim = container.firstElementChild!;
  assert.ok(scrim.className.includes('v12-scrim'));
  assert.ok(scrim.className.includes('v12-admin-scrim'));
  assert.ok(scrim.className.includes('z-[9999]'));
  assert.ok(scrim.className.includes('modal-safe-3'));
  assert.equal((scrim as HTMLElement).dir, 'rtl');
  unmount();
  cleanup();
});

test('outside click closes only when onClose is given', () => {
  let closes = 0;
  const withClose = renderScrim({ onClose: () => { closes += 1; } });
  fireEvent.click(withClose.container.firstElementChild!);
  assert.equal(closes, 1);
  withClose.unmount();
  cleanup();

  const withoutClose = renderScrim();
  fireEvent.click(withoutClose.container.firstElementChild!); // must not throw
  withoutClose.unmount();
  cleanup();
});

test('closing an open scrim unmounts the children', async () => {
  const { rerender, getByTestId, unmount } = renderScrim();
  assert.ok(getByTestId('sheet'));
  rerender(React.createElement(ModalScrim, {
    isOpen: false, isRTL: true, layerClass: 'z-[9999] modal-safe-3',
    children: React.createElement('div', { 'data-testid': 'sheet' }, 'sheet'),
  }));
  await waitFor(() => assert.equal(document.body.textContent?.includes('sheet'), false));
  unmount();
  cleanup();
});
