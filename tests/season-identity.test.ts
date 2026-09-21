import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BADGE_MOTIFS, BADGE_STYLES, BIOGLOW_IDENTITY, NEUTRAL_IDENTITY, buildIdentityPrompt, extractIdentityJson, parseSeasonIdentity } from '../src/features/referee/season/identityModel.ts';
import { extractSeasonFromFilename } from '../src/features/referee/rulebook/season.ts';

const VALID = {
  wordmark: 'submerged',
  from: '#0e5a8a', via: '#0a4468', to: '#062f49',
  edge: '#f5b942', ink: '#f2f9ff', iconInk: '#d8ecfa',
  glow: 'rgba(14,90,138,0.35)', motif: 'wave', style: 'pill',
};

test('a valid generated identity parses and keeps its values', () => {
  const parsed = parseSeasonIdentity(VALID, 'SUBMERGED');
  assert.ok(parsed);
  assert.equal(parsed.from, '#0e5a8a');
  assert.equal(parsed.motif, 'wave');
  assert.equal(parsed.style, 'pill');
  assert.equal(parsed.source, 'gemini');
});

test('wordmark is uppercased and falls back to the season name', () => {
  const parsed = parseSeasonIdentity(VALID, 'SUBMERGED');
  assert.equal(parsed.wordmark, 'SUBMERGED');
  const noWordmark = parseSeasonIdentity({ ...VALID, wordmark: '  ' }, 'SUBMERGED');
  assert.equal(noWordmark?.wordmark, 'SUBMERGED');
});

test('bad colors, motifs, and styles are rejected', () => {
  assert.equal(parseSeasonIdentity({ ...VALID, from: 'blue' }, 'SUBMERGED'), null);
  assert.equal(parseSeasonIdentity({ ...VALID, glow: 'blue' }, 'SUBMERGED'), null);
  assert.equal(parseSeasonIdentity({ ...VALID, motif: 'whistle' }, 'SUBMERGED'), null);
  assert.equal(parseSeasonIdentity({ ...VALID, style: 'hexagon' }, 'SUBMERGED'), null);
  assert.equal(parseSeasonIdentity(null, 'SUBMERGED'), null);
  assert.equal(parseSeasonIdentity('{}', 'SUBMERGED'), null);
});

test('every motif and style in the prompt contract validates', () => {
  for (const motif of BADGE_MOTIFS) assert.ok(parseSeasonIdentity({ ...VALID, motif }, 'X'), motif);
  for (const style of BADGE_STYLES) assert.ok(parseSeasonIdentity({ ...VALID, style }, 'X'), style);
});

test('extractIdentityJson finds JSON inside prose and rejects garbage', () => {
  const found = extractIdentityJson('Here is the design:\n' + JSON.stringify(VALID) + '\nDone.');
  assert.ok(found);
  assert.equal((found as Record<string, unknown>).motif, 'wave');
  assert.equal(extractIdentityJson('no json here'), null);
  assert.equal(extractIdentityJson('{broken'), null);
});

test('seeds pass their own validation and BIOGLOW keeps the mat badge', () => {
  const seeded = parseSeasonIdentity({ ...BIOGLOW_IDENTITY, source: undefined }, 'BIOGLOW');
  assert.ok(seeded);
  assert.equal(seeded.style, 'parallelogram');
  assert.equal(seeded.motif, 'leaf');
  assert.ok(parseSeasonIdentity({ ...NEUTRAL_IDENTITY, source: undefined }, 'X'));
});

test('identity prompt is season-generic and carries the JSON contract', () => {
  const prompt = buildIdentityPrompt('AQUALINK');
  assert.match(prompt, /AQUALINK/);
  assert.match(prompt, /Google Search/);
  assert.match(prompt, /parallelogram\|pill\|ticket/);
  assert.doesNotMatch(prompt, /BIOGLOW/);
});

test('future seasons resolve from filenames without a hardcoded list', () => {
  assert.equal(extractSeasonFromFilename('Aqualink.pdf'), 'AQUALINK');
  assert.equal(extractSeasonFromFilename('fll-rules/BioGlow_updates.pdf'), 'BIOGLOW');
});
