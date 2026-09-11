/**
 * keyVault.ts — client-side envelope decryption for the Gemini key pool.
 *
 * WHAT: pool entries in Firestore `secrets/api_keys` may be stored as
 * `ENC1.<base64url>` envelopes (AES-256-GCM, key hardened with PBKDF2-SHA256
 * x210k) instead of plaintext `AIza...` keys. This module unwraps them.
 *
 * THREAT MODEL — read before relying on this:
 * - The unwrapping material ships inside this JS bundle, so a determined
 *   attacker who reverse-engineers the code CAN recover the keys. This is
 *   obfuscation + real crypto, not a secret vault.
 * - What it DOES achieve: no `AIza` string exists anywhere at rest (neither
 *   in Firestore nor in the bundle), so casual reads, console screenshots,
 *   `grep`, and DevTools-Network skimming of Firestore traffic show nothing.
 * - Real enforcement MUST live in Google Cloud on the key itself:
 *   HTTP-referrer restriction to our domains + Generative Language API only
 *   + per-minute quotas + budget alerts. See scripts/vault-encrypt.mjs.
 */

export const VAULT_PREFIX = 'ENC1.';

const PBKDF2_ITERATIONS = 210000;

// Pepper: random bytes baked into the bundle. NOT a standalone secret — it
// only forces an attacker to read code instead of grepping strings.
const PEPPER: readonly number[] = [
  6, 36, 137, 151, 87, 141, 117, 86, 10, 199, 46, 157, 137, 155, 129, 81,
  29, 110, 25, 29, 52, 222, 53, 150, 86, 112, 3, 94, 95, 128, 116, 37,
];

type VaultEnvelope = { s: string; i: string; c: string };

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function b64ToB64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToB64(url: string): string {
  let b64 = url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return b64;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Key material: pepper bytes + public Firebase app identifiers. Using values
// that already ship in the bundle means there is no secret-looking string to
// grep for — the "secret" is the combination + the KDF work factor.
async function baseMaterial(): Promise<Uint8Array> {
  const { app } = await import('./firebase');
  const enc = new TextEncoder();
  const options = app.options || {};
  return concatBytes(
    new Uint8Array(PEPPER),
    enc.encode(String(options.apiKey || '')),
    enc.encode('|'),
    enc.encode(String(options.appId || '')),
    enc.encode('|'),
    enc.encode(String(options.projectId || '')),
  );
}

const derivedKeyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(saltB64: string, salt: Uint8Array): Promise<CryptoKey> {
  let cached = derivedKeyCache.get(saltB64);
  if (!cached) {
    cached = (async () => {
      const material = await baseMaterial();
      const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
    })();
    derivedKeyCache.set(saltB64, cached);
  }
  return cached;
}

function parseEnvelope(entry: string): VaultEnvelope | null {
  try {
    const json = new TextDecoder().decode(b64ToBytes(b64UrlToB64(entry.slice(VAULT_PREFIX.length))));
    const parsed = JSON.parse(json) as Partial<VaultEnvelope>;
    if (typeof parsed?.s === 'string' && typeof parsed?.i === 'string' && typeof parsed?.c === 'string') {
      return { s: parsed.s, i: parsed.i, c: parsed.c };
    }
  } catch {
    // Malformed envelope — caller drops it.
  }
  return null;
}

/** Unwrap one pool entry. Returns the plaintext key or null. */
export async function unwrapPoolEntry(entry: unknown): Promise<string | null> {
  if (typeof entry !== 'string' || !entry) return null;
  // Legacy plaintext entries keep working during the transition.
  if (entry.startsWith('AIza')) return entry;
  if (!entry.startsWith(VAULT_PREFIX)) return null;
  const envelope = parseEnvelope(entry);
  if (!envelope) return null;
  try {
    const salt = b64ToBytes(b64UrlToB64(envelope.s));
    const iv = b64ToBytes(b64UrlToB64(envelope.i));
    const ct = b64ToBytes(b64UrlToB64(envelope.c));
    const key = await deriveKey(envelope.s, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    const text = new TextDecoder().decode(plain);
    return text.startsWith('AIza') ? text : null;
  } catch {
    return null;
  }
}

/** Unwrap a whole pool (Firestore `api_keys` values). Bad entries are dropped. */
export async function decryptPoolEntries(values: unknown[]): Promise<string[]> {
  const out: string[] = [];
  for (const value of values || []) {
    try {
      const key = await unwrapPoolEntry(value);
      if (key && !out.includes(key)) out.push(key);
    } catch {
      // Skip undecryptable entries.
    }
  }
  return out;
}

/** Exposed for tests/diagnostics only — not used by the app at runtime. */
export const __vaultInternals = { bytesToB64, b64ToBytes, b64ToB64Url, b64UrlToB64, PBKDF2_ITERATIONS };
