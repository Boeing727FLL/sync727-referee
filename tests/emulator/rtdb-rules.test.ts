/**
 * RTDB security-rule tests against the local database emulator.
 * Run: PATH=<jdk> npx firebase emulators:exec --only database --project demo-referee \
 *   'node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs --test tests/emulator/rtdb-rules.test.ts'
 * Lives outside tests/*.test.ts so `npm test` skips it (needs the emulator).
 */
import test from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, set, push, serverTimestamp } from 'firebase/database';
import { readFileSync } from 'node:fs';

const OWNER = { email: 'boeing727.il@gmail.com', email_verified: true };
let env: RulesTestEnvironment;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-referee',
    database: { rules: readFileSync('database.rules.json', 'utf8') },
  });
});
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => { await env.clearDatabase(); });

const asUser = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).database();
const asOwner = () => env.authenticatedContext('owner-uid', OWNER).database();
const asAnon = () => env.unauthenticatedContext().database();

const validLog = (createdAt: unknown) => ({ question: 'מה השוויון?', answer: 'כולם שווים', uid: 'u1', createdAt });

// --- logs: createdAt must be a real timestamp ---
test('logs: serverTimestamp and numeric createdAt are accepted', async () => {
  await assertSucceeds(Promise.resolve(push(ref(asUser('u1'), 'referee/logs'), validLog(serverTimestamp()))));
  await assertSucceeds(Promise.resolve(push(ref(asUser('u1'), 'referee/logs'), validLog(Date.now()))));
});
test('logs: string or boolean createdAt is rejected', async () => {
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/logs'), validLog('yesterday'))));
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/logs'), validLog(true))));
});
test('logs: missing question, empty question, or forged uid is rejected', async () => {
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/logs'), { uid: 'u1', createdAt: Date.now() })));
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/logs'), { ...validLog(Date.now()), question: '' })));
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/logs'), { ...validLog(Date.now()), uid: 'someone-else' })));
});
test('logs: anonymous cannot write; existing entries cannot be edited by non-owner', async () => {
  await assertFails(Promise.resolve(push(ref(asAnon(), 'referee/logs'), validLog(Date.now()))));
  const db = asUser('u1');
  const entry = push(ref(db, 'referee/logs'));
  await assertSucceeds(set(entry, validLog(Date.now())));
  await assertFails(set(entry, { ...validLog(Date.now()), answer: 'edited' }));
  // Owner may delete an entry (validate passes on null); the uid rule
  // intentionally blocks even the owner from rewriting another user's entry.
  await assertFails(set(ref(asOwner(), `referee/logs/${entry.key}`), { ...validLog(Date.now()), answer: 'owner edit' }));
  const { remove } = await import('firebase/database');
  await assertSucceeds(remove(ref(asOwner(), `referee/logs/${entry.key}`)));
});

// --- feedback: rating range + createdAt type ---
test('feedback: valid entry accepted; bad rating or createdAt rejected', async () => {
  const ok = { rating: 4, uid: 'u1', createdAt: serverTimestamp() };
  await assertSucceeds(Promise.resolve(push(ref(asUser('u1'), 'referee/feedback'), ok)));
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/feedback'), { ...ok, rating: 6, createdAt: Date.now() })));
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/feedback'), { ...ok, rating: 0, createdAt: Date.now() })));
  await assertFails(Promise.resolve(push(ref(asUser('u1'), 'referee/feedback'), { ...ok, createdAt: 'just now' })));
});
