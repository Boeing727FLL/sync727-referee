import assert from 'node:assert/strict';
import test from 'node:test';
import { describeRequestFile, textRulebookLabel } from '../src/features/referee/ai/filePlan.ts';

test('classifies R2 PDF and text rulebooks for request assembly', () => {
  const pdf = describeRequestFile({ key: 'UNEARTHED.pdf', url: 'https://r2.test/fll-rules/UNEARTHED.pdf', isRulebook: true });
  assert.deepEqual({ pdf: pdf.isPdf, text: pdf.isText, r2: pdf.isR2Rulebook }, { pdf: true, text: false, r2: true });
  for (const name of ['rules.txt', 'rules.md', 'rules.json']) {
    const text = describeRequestFile({ key: name, url: `https://r2.test/fll-rules/${name}`, isRulebook: true });
    assert.equal(text.isText, true, name);
    assert.equal(text.isR2Rulebook, true, name);
  }
});

test('text rulebooks are explicitly delimited as official context', () => {
  assert.match(textRulebookLabel('rules.txt', 'M01 gives 20 points.'), /RULEBOOK TEXT[\s\S]*M01 gives 20 points/);
});
