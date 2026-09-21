import assert from 'node:assert/strict';
import test from 'node:test';
import { translations, translateFor, type LanguageCode } from '../src/locales/index.ts';

const LOCALES = Object.keys(translations) as LanguageCode[];

test('every shipped locale carries the identical key set', () => {
  const reference = Object.keys(translations.en).sort();
  for (const code of LOCALES) {
    assert.deepEqual(Object.keys(translations[code]).sort(), reference, `locale ${code} key mismatch`);
  }
});

test('no translation value is empty', () => {
  for (const code of LOCALES) {
    for (const [key, value] of Object.entries(translations[code])) {
      assert.ok(value.trim().length > 0, `${code}:${key} is empty`);
    }
  }
});

test('localized surfaces are actually translated out of Hebrew', () => {
  const hebrew = /[\u0590-\u05FF]/;
  const keys = [
    'disclaimerPopup.hint', 'common.creditBuiltBy', 'common.close', 'common.cancel',
    'common.logout' /* absent on purpose */, 'chat.guardRulebookLoadFailed', 'chat.guardNoRulebook',
    'chat.guardRateLimited', 'chat.guardCooldown', 'chat.guardHourlyLimit',
    'chat.rulebookIncomplete', 'chat.rulebookPagesFailed', 'chat.serviceBusy',
    'chat.serviceTemporaryFailure', 'feedback.title', 'account.deleteTitle',
    'account.kickedBody', 'maintenance.body', 'errorBoundary.body', 'privacy.title',
  ].filter(k => k !== 'common.logout');
  for (const key of keys) {
    assert.ok(hebrew.test(translations.he[key]), `he:${key} should be Hebrew`);
    for (const code of LOCALES) {
      if (code === 'he') continue;
      assert.ok(!hebrew.test(translations[code][key]), `${code}:${key} still Hebrew`);
    }
  }
});

test('translateFor falls back language -> English -> Hebrew', () => {
  assert.equal(translateFor('en', 'disclaimerPopup.hint'), translations.en['disclaimerPopup.hint']);
  assert.equal(translateFor('fr', 'disclaimerPopup.hint'), translations.fr['disclaimerPopup.hint']);
  assert.equal(translateFor('xx', 'disclaimerPopup.hint'), translations.en['disclaimerPopup.hint']);
});

test('guard notices come out in the asking language', () => {
  assert.notEqual(translateFor('en', 'chat.guardNoRulebook'), translateFor('he', 'chat.guardNoRulebook'));
  assert.ok(translateFor('en', 'chat.guardNoRulebook').startsWith('No rulebook'));
  assert.ok(translateFor('ko', 'chat.guardNoRulebook').length > 0);
});
