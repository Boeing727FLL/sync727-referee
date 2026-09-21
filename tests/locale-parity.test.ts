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

// ---- IntroScreen semantic parity -----------------------------------------
// Hebrew is the semantic source of truth: every locale must express the same
// product content, not language-specific alternate copy. The anchors below
// lock the Hebrew source and the canonical English rendering; the structural
// checks keep every locale on the same claims.

const INTRO_PARITY_KEYS = [
  'intro.descFull',
  'intro.feature1Title', 'intro.feature1Desc',
  'intro.feature2Title', 'intro.feature2Desc',
  'intro.feature3Title', 'intro.feature3Desc',
  'intro.continue',
];

test('intro Hebrew source copy stays the semantic anchor', () => {
  assert.equal(translations.he['intro.descFull'], 'שופט הזירה הווירטואלי הוא צ\'אט AI שנועד לעזור בהבנת חוקי המשחק.');
  assert.equal(translations.he['intro.feature1Title'], 'שואלים במילים שלכם');
  assert.equal(translations.he['intro.feature2Title'], 'זמין מכל מקום');
  assert.equal(translations.he['intro.feature3Title'], 'מבוסס על המסמכים הרשמיים');
  assert.equal(translations.he['intro.continue'], 'המשך לשופט');
});

test('intro English matches the Hebrew claims', () => {
  assert.equal(translations.en['intro.descFull'], 'The Virtual Field Referee is an AI chat designed to help you understand the game rules.');
  assert.equal(translations.en['intro.feature1Title'], 'Ask in your own words');
  assert.equal(translations.en['intro.feature1Desc'], 'Anything about the robot game - ask however you like and get a clear answer.');
  assert.equal(translations.en['intro.feature2Title'], 'Available from anywhere');
  assert.equal(translations.en['intro.feature2Desc'], 'Works from your phone, your computer and the field - always there when you need it.');
  assert.equal(translations.en['intro.feature3Title'], 'Based on the official documents');
  assert.equal(translations.en['intro.feature3Desc'], "Answers rely on FIRST's official rules and updates.");
  assert.equal(translations.en['intro.continue'], 'Continue to Referee');
});

test('intro feature cards stay three distinct ideas in every locale', () => {
  for (const code of LOCALES) {
    const t1 = translations[code]['intro.feature1Title'];
    const t2 = translations[code]['intro.feature2Title'];
    const t3 = translations[code]['intro.feature3Title'];
    assert.ok(t1 !== t2 && t2 !== t3 && t1 !== t3, `${code}: feature titles must be distinct`);
    for (const key of INTRO_PARITY_KEYS) {
      assert.ok(translations[code][key].trim().length > 0, `${code}:${key} empty`);
    }
  }
});
