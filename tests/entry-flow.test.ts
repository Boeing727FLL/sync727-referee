import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chatStarted,
  disclaimerConfirm,
  enterFromUrl,
  exitToIntro,
  initialEntryState,
  introContinue,
  showDisclaimer,
  showIntro,
} from '../src/features/referee/session/entryFlow.ts';

test('a cold visit starts on the intro', () => {
  const s = initialEntryState(false);
  assert.equal(showIntro(s), true);
  assert.equal(chatStarted(s), false);
  assert.equal(showDisclaimer(s), false);
});

test('?enter=chat with a saved session lands on the disclaimer over the chat', () => {
  const s = initialEntryState(true);
  assert.equal(showDisclaimer(s), true);
  assert.equal(chatStarted(s), true);
  assert.equal(s.pendingEnterChat, true);
});

test('intro CTA: signed-in users advance to the disclaimer, guests go to login', () => {
  const s = initialEntryState(false);
  const guest = introContinue(s, false);
  assert.equal(guest.navigateToLogin, true);
  assert.equal(guest.next.stage, 'intro');
  const member = introContinue(s, true);
  assert.equal(member.navigateToLogin, false);
  assert.equal(member.next.stage, 'disclaimer');
});

test('confirming the disclaimer opens the chat and consumes the URL flag', () => {
  const s = disclaimerConfirm(initialEntryState(true));
  assert.equal(s.stage, 'chat');
  assert.equal(s.pendingEnterChat, false);
  assert.equal(s.typewriterReady, true);
  assert.equal(showIntro(s), false);
});

test('confirm is only valid from the disclaimer stage', () => {
  const s = initialEntryState(false);
  assert.equal(disclaimerConfirm(s), s);
});

test('exit resets to a fresh intro; a later ?enter=chat re-arms the disclaimer', () => {
  const exited = exitToIntro();
  assert.equal(showIntro(exited), true);
  const rearmed = enterFromUrl(exited);
  assert.equal(showDisclaimer(rearmed), true);
  assert.equal(rearmed.pendingEnterChat, true);
});
