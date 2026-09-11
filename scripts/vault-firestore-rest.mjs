/**
 * vault-firestore-rest.mjs — OWNER-ONLY. Same job as vault-firestore-encrypt.mjs
 * but authenticates with a Google OAuth access token (Firebase CLI login) and
 * talks to the Firestore REST API, which enforces IAM instead of security rules.
 *
 *   $env:FIREBASE_BEARER='<access token from Firebase CLI login>'
 *   node scripts/vault-firestore-rest.mjs            # inventory only
 *   node scripts/vault-firestore-rest.mjs --apply    # encrypt + write back
 *
 * SAFETY: same as vault-firestore-encrypt.mjs — in-memory round-trip verify
 * before writing, plaintext never printed, post-write re-read assertion.
 */
import { encryptKey, decryptEnvelope, VAULT_PREFIX } from './vault-crypto.mjs';

const PROJECT_ID = 'sync-727-referee';
const DOC_PATH = 'secrets/api_keys';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const bearer = process.env.FIREBASE_BEARER || '';
if (!bearer) {
  console.error('Missing FIREBASE_BEARER env var.');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');

const headers = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };

async function getDoc() {
  const res = await fetch(`${BASE}/${DOC_PATH}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Flatten one Firestore REST value into {kind, strings[]} for inventory,
// and rebuild it with replacements applied.
const isPlaintextKey = (v) => typeof v === 'string' && v.startsWith('AIza');
const isEnvelope = (v) => typeof v === 'string' && v.startsWith(VAULT_PREFIX);

const doc = await getDoc();
if (!doc || !doc.fields) {
  console.error('secrets/api_keys missing or empty — nothing to do.');
  process.exit(1);
}

// Collect plaintext strings with their location: {topField, index|null}.
const targets = [];
let alreadySealed = 0;
for (const [field, value] of Object.entries(doc.fields)) {
  if (value?.arrayValue?.values) {
    value.arrayValue.values.forEach((entry, index) => {
      if (isPlaintextKey(entry?.stringValue)) targets.push({ field, index });
      else if (isEnvelope(entry?.stringValue)) alreadySealed++;
    });
  } else if (isPlaintextKey(value?.stringValue)) {
    targets.push({ field, index: null });
  } else if (isEnvelope(value?.stringValue)) {
    alreadySealed++;
  }
}
console.log(`Plaintext keys: ${targets.length} | already sealed: ${alreadySealed} | fields: ${Object.keys(doc.fields).join(', ')}`);

if (targets.length === 0) {
  console.log('Nothing to encrypt.');
  process.exit(0);
}
if (!APPLY) {
  console.log('Dry run only — re-run with --apply to encrypt in place.');
  process.exit(0);
}

const replacements = new Map();
for (const t of targets) {
  const holder = doc.fields[t.field];
  const original = t.index === null ? holder.stringValue : holder.arrayValue.values[t.index].stringValue;
  const sealed = await encryptKey(original);
  const back = await decryptEnvelope(sealed);
  if (back !== original || !sealed.startsWith(VAULT_PREFIX) || /AIza/.test(sealed)) {
    console.error(`VERIFY FAILED for field "${t.field}" — aborting, nothing written.`);
    process.exit(1);
  }
  replacements.set(t, sealed);
}

// Rebuild changed top-level fields in REST format + update mask.
const body = { fields: {} };
const mask = [];
for (const [t, sealed] of replacements) {
  const holder = doc.fields[t.field];
  if (t.index === null) {
    body.fields[t.field] = { stringValue: sealed };
  } else {
    const values = holder.arrayValue.values.map((entry, i) =>
      i === t.index ? { stringValue: sealed } : entry);
    // Fill any other plaintext siblings from the same field.
    for (const t2 of targets) {
      if (t2.field === t.field && t2.index !== null && replacements.has(t2)) {
        values[t2.index] = { stringValue: replacements.get(t2) };
      }
    }
    body.fields[t.field] = { arrayValue: { values } };
  }
  if (!mask.includes(t.field)) mask.push(t.field);
}
const params = new URLSearchParams();
for (const f of mask) params.append('updateMask.fieldPaths', f);
const patch = await fetch(`${BASE}/${DOC_PATH}?${params}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
if (!patch.ok) {
  console.error(`PATCH failed: ${patch.status} ${await patch.text()}`);
  process.exit(1);
}

const check = await getDoc();
const leftover = Object.values(check.fields || {})
  .flatMap((v) => (v?.arrayValue?.values ? v.arrayValue.values : [v]))
  .filter((v) => isPlaintextKey(v?.stringValue)).length;
if (leftover > 0) {
  console.error(`WRITE PROBLEM: ${leftover} plaintext keys still present.`);
  process.exit(1);
}
console.log(`DONE: ${replacements.size} keys sealed in place, 0 plaintext remaining.`);
