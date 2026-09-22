/**
 * Firestore security-rule tests against the local emulator.
 * Run: npx firebase emulators:exec --only firestore --project demo-referee \
 *   'node --experimental-strip-types --test tests/emulator/firestore-rules.test.ts'
 * These live outside tests/*.test.ts so `npm test` skips them (they need the emulator).
 */
import test from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const OWNER = { email: 'boeing727.il@gmail.com', email_verified: true };
let env: RulesTestEnvironment;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-referee',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await env.clearFirestore(); });

const asUser = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();
const asOwner = () => env.authenticatedContext('owner-uid', OWNER).firestore();

// --- chat_quota: the server-enforced 55/day budget ---
test('quota: first question creates count=1 with server time', async () => {
  await assertSucceeds(setDoc(doc(asUser('u1'), 'chat_quota/u1'), { count: 1, windowStart: serverTimestamp() }));
});
test('quota: cannot create at a higher count or a forged window', async () => {
  await assertFails(setDoc(doc(asUser('u2'), 'chat_quota/u2'), { count: 30, windowStart: serverTimestamp() }));
  await assertFails(setDoc(doc(asUser('u2'), 'chat_quota/u2'), { count: 1, windowStart: Timestamp.fromMillis(0) }));
});
test('quota: cannot create someone else\'s doc', async () => {
  await assertFails(setDoc(doc(asUser('u3'), 'chat_quota/other'), { count: 1, windowStart: serverTimestamp() }));
});
test('quota: increments strictly by one inside the window, never skips or lowers', async () => {
  const db = asUser('u4');
  const ref = doc(db, 'chat_quota/u4');
  await assertSucceeds(setDoc(ref, { count: 1, windowStart: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { count: 2 }));
  await assertFails(updateDoc(ref, { count: 4 }));   // skip
  await assertFails(updateDoc(ref, { count: 1 }));   // lower
  await assertFails(updateDoc(ref, { count: 56 }));  // over cap
});
test('quota: cannot be deleted or given extra fields', async () => {
  const db = asUser('u5');
  const ref = doc(db, 'chat_quota/u5');
  await assertSucceeds(setDoc(ref, { count: 1, windowStart: serverTimestamp() }));
  await assertFails(deleteDoc(ref));
  await assertFails(updateDoc(ref, { count: 2, backdoor: true }));
});
test('quota: window resets only after 24h with a fresh server window', async () => {
  const db = asUser('u6');
  const ref = doc(db, 'chat_quota/u6');
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'chat_quota/u6'), { count: 55, windowStart: Timestamp.fromMillis(Date.now() - 25 * 3600_000) });
  });
  await assertSucceeds(updateDoc(ref, { count: 1, windowStart: serverTimestamp() }));
});
test('quota: expired-window reset cannot smuggle a count above 1', async () => {
  const db = asUser('u7');
  const ref = doc(db, 'chat_quota/u7');
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'chat_quota/u7'), { count: 55, windowStart: Timestamp.fromMillis(Date.now() - 25 * 3600_000) });
  });
  await assertFails(updateDoc(ref, { count: 2, windowStart: serverTimestamp() }));
});

// --- referee_logs: append-only, uid-bound ---
test('logs: signed-in users append their own entries; uid forgery fails', async () => {
  const entry = { question: 'q', answer: 'a', season: 'S', language: 'he', uid: 'u1', model: 'm', ok: true, createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(asUser('u1'), 'referee_logs/l1'), entry));
  await assertFails(setDoc(doc(asUser('u1'), 'referee_logs/l2'), { ...entry, uid: 'victim' }));
  await assertFails(setDoc(doc(asUser('u1'), 'referee_logs/l3'), { ...entry, question: '' }));
  await assertFails(setDoc(doc(asUser('u1'), 'referee_logs/l4'), { ...entry, extra: 'field' }));
});
test('logs: no updates; deletes are owner-only; reads need sign-in', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'referee_logs/l1'), { question: 'q', uid: 'u1', createdAt: Timestamp.now() });
  });
  await assertFails(updateDoc(doc(asUser('u1'), 'referee_logs/l1'), { answer: 'edited' }));
  await assertFails(deleteDoc(doc(asUser('u1'), 'referee_logs/l1')));
  await assertSucceeds(deleteDoc(doc(asOwner(), 'referee_logs/l1')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'referee_logs')));
});

// --- users: self-scoped, role and uid immutable on update ---
test('users: self read/update of own doc; role and uid cannot change', async () => {
  const db = asUser('u9');
  await assertSucceeds(setDoc(doc(db, 'users/u9'), { uid: 'u9', role: 'member', name: 'N' }));
  await assertSucceeds(updateDoc(doc(db, 'users/u9'), { name: 'N2' }));
  await assertFails(updateDoc(doc(db, 'users/u9'), { role: 'mentor' }));
  await assertFails(updateDoc(doc(db, 'users/u9'), { uid: 'someone-else' }));
  await assertFails(getDoc(doc(asUser('u9'), 'users/other')));
});

// --- secrets + season identities + app_config ---
test('secrets and app_config: signed-in read, owner-only write', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'secrets/api_keys'), { gemini_keys: ['x'] });
    await setDoc(doc(ctx.firestore(), 'app_config/rulebook'), { files: [] });
  });
  await assertSucceeds(getDoc(doc(asUser('u10'), 'secrets/api_keys')));
  await assertFails(setDoc(doc(asUser('u10'), 'secrets/api_keys'), { gemini_keys: ['mine'] }));
  await assertSucceeds(setDoc(doc(asOwner(), 'app_config/rulebook'), { files: ['a'] }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'secrets/api_keys')));
});

// --- default deny ---
test('default deny: unknown collections are closed', async () => {
  await assertFails(getDoc(doc(asUser('u11'), 'random_collection/x')));
  await assertFails(setDoc(doc(asUser('u11'), 'random_collection/x'), { a: 1 }));
});

// --- season_identities: shared badge, owner-published ---
test('season_identities: signed-in read, anonymous denied, owner-only write', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'season_identities/2026'), { via: '#FFC400', season: '2026' });
  });
  await assertSucceeds(getDoc(doc(asUser('u10'), 'season_identities/2026')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'season_identities/2026')));
  await assertFails(setDoc(doc(asUser('u10'), 'season_identities/2026'), { via: '#000000' }));
  await assertSucceeds(setDoc(doc(asOwner(), 'season_identities/2026'), { via: '#111111', season: '2026' }));
});

// --- quota: window-forgery abuse ---
test('quota: cannot reset an active window by forging windowStart', async () => {
  const db = asUser('u11');
  const ref = doc(db, 'chat_quota/u11');
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'chat_quota/u11'), { count: 54, windowStart: Timestamp.now() });
  });
  // Window is still fresh: dropping back to count=1 with a new timestamp is forgery.
  await assertFails(updateDoc(ref, { count: 1, windowStart: serverTimestamp() }));
  // Skipping ahead inside the window is also rejected (strictly +1), and the 55 cap holds.
  await assertFails(updateDoc(ref, { count: 56, windowStart: serverTimestamp() }));
  // The only legal move: +1 while keeping the original windowStart.
  const snap = await getDoc(ref);
  await assertSucceeds(updateDoc(ref, { count: 55, windowStart: snap.data()!.windowStart }));
});

// --- logs: size boundaries ---
test('logs: question/answer size limits are enforced at the boundary', async () => {
  const base = { question: 'x'.repeat(1999), season: 'S', language: 'he', uid: 'u12', model: 'm', ok: true, createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(asUser('u12'), 'referee_logs/b1'), base));
  await assertFails(setDoc(doc(asUser('u12'), 'referee_logs/b2'), { ...base, question: 'x'.repeat(2000) }));
  await assertSucceeds(setDoc(doc(asUser('u12'), 'referee_logs/b3'), { ...base, answer: 'y'.repeat(19999) }));
  await assertFails(setDoc(doc(asUser('u12'), 'referee_logs/b4'), { ...base, answer: 'y'.repeat(20001) }));
  await assertFails(setDoc(doc(asUser('u12'), 'referee_logs/b5'), { ...base, answer: 42 }));
});

// --- users: create forgery ---
test('users: cannot create with a forged uid field', async () => {
  await assertFails(setDoc(doc(asUser('u13'), 'users/u13'), { uid: 'u14', role: 'member' }));
  await assertSucceeds(setDoc(doc(asUser('u13'), 'users/u13'), { uid: 'u13', role: 'member' }));
  // KNOWN GAP (reported, semantics preserved per owner-pending decision): the
  // create rule binds only the uid FIELD, not the doc id, and leaves role
  // unchecked at create - a signed-in user can plant users docs at arbitrary
  // ids with arbitrary role values.
});
