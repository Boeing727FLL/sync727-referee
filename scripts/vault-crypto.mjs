/**
 * vault-crypto.mjs — shared AES-GCM envelope crypto (Node side).
 *
 * KEEP IN SYNC with src/lib/keyVault.ts: PEPPER, PBKDF2_ITERATIONS,
 * FIREBASE_* identifiers, and the envelope format. Imported by
 * vault-encrypt.mjs and vault-firestore-encrypt.mjs — no CLI side effects here.
 */
import { webcrypto } from 'node:crypto';

export const PEPPER = [
  6, 36, 137, 151, 87, 141, 117, 86, 10, 199, 46, 157, 137, 155, 129, 81,
  29, 110, 25, 29, 52, 222, 53, 150, 86, 112, 3, 94, 95, 128, 116, 37,
];
export const PBKDF2_ITERATIONS = 210000;
export const VAULT_PREFIX = 'ENC1.';

// Public identifiers from src/lib/firebase.ts (public values — they only deny
// grep, the KDF work factor + Google-side restrictions do the real job).
export const FIREBASE_API_KEY = 'AIzaSyAShqcVG0F-Vjkg8uVK9QYRjgLGyUAI_PI';
export const FIREBASE_APP_ID = '1:804828140815:web:9a617392dea1e037649a7a';
export const FIREBASE_PROJECT_ID = 'sync-727-referee';

const subtle = webcrypto.subtle;

function material() {
  const pepper = new Uint8Array(PEPPER);
  const text = new TextEncoder().encode(`${FIREBASE_API_KEY}|${FIREBASE_APP_ID}|${FIREBASE_PROJECT_ID}`);
  const out = new Uint8Array(pepper.length + text.length);
  out.set(pepper, 0);
  out.set(text, pepper.length);
  return out;
}

export async function deriveKey(salt, usages = ['encrypt', 'decrypt']) {
  const baseKey = await subtle.importKey('raw', material(), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export async function encryptKey(plaintext) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(salt);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  const envelope = {
    s: Buffer.from(salt).toString('base64'),
    i: Buffer.from(iv).toString('base64'),
    c: Buffer.from(ct).toString('base64'),
  };
  return VAULT_PREFIX + Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
}

export async function decryptEnvelope(entry) {
  const envelope = JSON.parse(Buffer.from(entry.slice(VAULT_PREFIX.length), 'base64url').toString('utf8'));
  const salt = new Uint8Array(Buffer.from(envelope.s, 'base64'));
  const iv = new Uint8Array(Buffer.from(envelope.i, 'base64'));
  const ct = new Uint8Array(Buffer.from(envelope.c, 'base64'));
  const key = await deriveKey(salt);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}
