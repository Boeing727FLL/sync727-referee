import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGAL, legalFor } from '../src/legal/copy.ts';

test('known languages return their own copy; unknown falls back to Hebrew', () => {
  assert.equal(legalFor('he'), LEGAL.he);
  assert.equal(legalFor('en'), LEGAL.en);
  assert.equal(legalFor('xx'), LEGAL.he);
  assert.equal(legalFor(''), LEGAL.he);
});

test('every language ships a complete legal pack', () => {
  for (const [lang, copy] of Object.entries(LEGAL)) {
    for (const doc of [copy.terms, copy.privacy]) {
      assert.ok(doc.title.trim(), `${lang}: doc title`);
      assert.ok(doc.updated.trim(), `${lang}: updated stamp`);
      assert.ok(doc.sections.length >= 3, `${lang}: at least three sections`);
      for (const [heading, body] of doc.sections) {
        assert.ok(heading.trim(), `${lang}: section heading`);
        assert.ok(body.trim().length > 20, `${lang}: section body for "${heading}"`);
      }
    }
    assert.ok(copy.gate.title.trim() && copy.gate.cta.trim() && copy.gate.check.trim(), `${lang}: gate copy`);
  }
});
