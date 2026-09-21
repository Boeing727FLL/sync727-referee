import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import IntroScreen from '../src/components/IntroScreen.tsx';
import { LanguageProvider } from '../src/hooks/useLanguage.tsx';
import { landingTranslations } from '../src/features/landing/translations.ts';

const heT = (key: string) => landingTranslations.he[key] || key;

function renderIntro(overrides: Partial<Parameters<typeof IntroScreen>[0]> = {}) {
  const props = {
    isLoggedIn: false,
    onContinue: () => {},
    t: heT,
    ...overrides,
  };
  return render(
    React.createElement(LanguageProvider, null, React.createElement(IntroScreen, props))
  );
}

test('IntroScreen renders the Hebrew hero and a single entry CTA', () => {
  const { getByRole, container, unmount } = renderIntro();
  const cta = getByRole('button');
  assert.ok(cta, 'entry button exists');
  assert.equal(container.querySelectorAll('button').length, 1, 'exactly one CTA');
  assert.ok(container.textContent && container.textContent.length > 40, 'hero copy rendered');
  unmount();
  cleanup();
});

test('IntroScreen CTA click fires onContinue exactly once per click', () => {
  let calls = 0;
  const { getByRole, unmount } = renderIntro({ onContinue: () => { calls += 1; } });
  const cta = getByRole('button');
  fireEvent.click(cta);
  fireEvent.click(cta);
  assert.equal(calls, 2);
  unmount();
  cleanup();
});

test('IntroScreen defaults to RTL under the Hebrew language provider', () => {
  const { unmount } = renderIntro();
  assert.equal(document.documentElement.dir, 'rtl');
  assert.equal(document.documentElement.lang, 'he');
  unmount();
  cleanup();
});
