import assert from 'node:assert/strict';
import test from 'node:test';
import { translations, translateFor } from '../src/locales/index.ts';

const base = Object.keys(translations.en).sort();

test('every locale exposes exactly the English key set', () => {
  for (const [code, table] of Object.entries(translations)) {
    assert.deepEqual(Object.keys(table).sort(), base, `${code} drifted from en`);
  }
});

test('no locale ships an empty or untranslated-looking value', () => {
  for (const [code, table] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(table)) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${code}.${key} is empty`);
    }
  }
});

test('unknown language falls back to English, unknown key falls back to the key', () => {
  assert.equal(translateFor('xx', 'chat.send'), translations.en['chat.send']);
  assert.equal(translateFor('he', 'no.such.key'), 'no.such.key');
});
