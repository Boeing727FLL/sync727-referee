/**
 * vault-firestore-encrypt.mjs — OWNER-ONLY. Encrypts the existing plaintext
 * Gemini keys inside Firestore `secrets/api_keys` IN PLACE. No new keys.
 *
 *   1. Inventory (read-only, default):
 *        $env:FIREBASE_EMAIL='boeing727.il@gmail.com'; $env:FIREBASE_PASSWORD='...'
 *        node scripts/vault-firestore-encrypt.mjs
 *   2. Encrypt + write back (only after you confirmed the inventory):
 *        node scripts/vault-firestore-encrypt.mjs --apply
 *
 * SAFETY:
 * - Every envelope is round-trip verified IN MEMORY (decrypt == original)
 *   before anything is written. A failed entry is skipped, never written.
 * - Plaintext keys are NEVER printed. Only field names + counts.
 * - After writing, the doc is re-read and asserted to contain zero plaintext.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  encryptKey,
  decryptEnvelope,
  VAULT_PREFIX,
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_PROJECT_ID,
} from './vault-crypto.mjs';

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: 'sync-727-referee.firebaseapp.com',
  databaseURL: 'https://sync-727-referee-default-rtdb.firebaseio.com',
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: 'sync-727-referee.firebasestorage.app',
  messagingSenderId: '804828140815',
  appId: FIREBASE_APP_ID,
};

const isPlaintextKey = (v) => typeof v === 'string' && v.startsWith('AIza');
const isEnvelope = (v) => typeof v === 'string' && v.startsWith(VAULT_PREFIX);

const email = process.env.FIREBASE_EMAIL || '';
const password = process.env.FIREBASE_PASSWORD || '';
if (!email || !password) {
  console.error('Missing FIREBASE_EMAIL / FIREBASE_PASSWORD env vars.');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

await signInWithEmailAndPassword(auth, email, password);
console.log(`Signed in as ${auth.currentUser?.email}`);

const ref = doc(db, 'secrets', 'api_keys');
const snap = await getDoc(ref);
if (!snap.exists()) {
  console.error('secrets/api_keys does not exist — nothing to do.');
  await signOut(auth);
  process.exit(1);
}
const data = snap.data();

// Collect {topField, index|null} for every plaintext key, arrays and objects.
const targets = [];
for (const [field, value] of Object.entries(data)) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (isPlaintextKey(entry)) targets.push({ field, index });
    });
  } else if (isPlaintextKey(value)) {
    targets.push({ field, index: null });
  }
}
const alreadySealed = Object.values(data).flatMap((v) => (Array.isArray(v) ? v : [v])).filter(isEnvelope).length;
console.log(`Plaintext keys: ${targets.length} | already sealed: ${alreadySealed} | fields: ${Object.keys(data).join(', ')}`);

if (targets.length === 0) {
  console.log('Nothing to encrypt.');
  await signOut(auth);
  process.exit(0);
}
if (!APPLY) {
  console.log('Dry run only — re-run with --apply to encrypt in place.');
  await signOut(auth);
  process.exit(0);
}

// Encrypt + in-memory round-trip verify each entry before touching Firestore.
const replacements = new Map();
for (const t of targets) {
  const original = t.index === null ? data[t.field] : data[t.field][t.index];
  const sealed = await encryptKey(original);
  const back = await decryptEnvelope(sealed);
  if (back !== original || !sealed.startsWith(VAULT_PREFIX) || /AIza/.test(sealed)) {
    console.error(`VERIFY FAILED for field "${t.field}" — aborting, nothing written.`);
    await signOut(auth);
    process.exit(1);
  }
  replacements.set(t, sealed);
}

// Mirror the doc shape, swapping only verified envelopes.
const next = { ...data };
for (const [t, sealed] of replacements) {
  if (t.index === null) next[t.field] = sealed;
  else next[t.field] = next[t.field].map((entry, i) => (i === t.index ? sealed : entry));
}
await setDoc(ref, next, { merge: true });

// Re-read and assert zero plaintext remains.
const check = (await getDoc(ref)).data();
const leftover = Object.values(check)
  .flatMap((v) => (Array.isArray(v) ? v : [v]))
  .filter(isPlaintextKey).length;
if (leftover > 0) {
  console.error(`WRITE PROBLEM: ${leftover} plaintext keys still present.`);
  await signOut(auth);
  process.exit(1);
}
console.log(`DONE: ${replacements.size} keys sealed in place, 0 plaintext remaining.`);
await signOut(auth);
process.exit(0);
