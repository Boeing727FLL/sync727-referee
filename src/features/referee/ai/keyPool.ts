/** API key pool for the referee engine: loads keys from Firestore (or the
 *  environment), tracks per-key health cooldowns and hands out keys with a
 *  health-aware random start, shared by every AI path. */
import { db } from '../../../lib/firebase/firestore';
import { KeyHealth } from './retryPolicy';

let GEMINI_KEYS: string[] = [];


// Cooldowns persist across refreshes, stored under a short fingerprint of
// each key (never the key value). Fingerprints stay correct when keys are
// added to or removed from the pool; positions would not.
const HEALTH_STORAGE = 'gemini_key_health_v2';
let keyHealthInstance: KeyHealth | null = null;
function keyFingerprint(key: string): string {
  // FNV-1a 32-bit: enough to tell ~100 keys apart, reveals nothing usable.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
export function keyHealthFor(keys: string[]): KeyHealth {
  if (keyHealthInstance) return keyHealthInstance;
  const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
  // v1 stored pool positions, which shift when keys are removed.
  try { storage?.removeItem('gemini_key_health_v1'); } catch { /* ignore */ }
  const byFingerprint = new Map(keys.map(key => [keyFingerprint(key), key]));
  const splitId = (id: string): [string, string | null] => {
    const at = id.indexOf('\u0000');
    return at < 0 ? [id, null] : [id.slice(0, at), id.slice(at + 1)];
  };
  keyHealthInstance = new KeyHealth(storage ? {
    storage,
    name: HEALTH_STORAGE,
    idOf: id => {
      const [head, model] = splitId(id);
      const ref = head === '*' ? '*' : `#${keyFingerprint(head)}`;
      return model === null ? ref : `${ref}\u0000${model}`;
    },
    fromId: stored => {
      const [head, model] = splitId(stored);
      const key = head === '*' ? '*' : byFingerprint.get(head.slice(1));
      if (!key) return null;
      return model === null ? key : `${key}\u0000${model}`;
    },
  } : undefined);
  return keyHealthInstance;
}

export function randomStart(size: number): number {
  return size > 0 ? Math.floor(Math.random() * size) : 0;
}

function getEnvKey(): string | undefined {
  return (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || import.meta.env?.VITE_GEMINI_API_KEY;
}

export async function ensureKeysLoaded(): Promise<void> {
  if (GEMINI_KEYS.length > 0) return;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const docRef = doc(db, "secrets", "api_keys");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const values = (Array.isArray(data.gemini_keys) ? data.gemini_keys : Object.values(data)) as unknown[];
      // Pool entries may be plaintext (legacy) or ENC1 vault envelopes — see src/lib/keyVault.ts.
      const { decryptPoolEntries } = await import('../../../lib/keyVault');
      const keys = await decryptPoolEntries(values);
      if (keys.length) GEMINI_KEYS = keys;
      console.log("Referee key pool loaded.");
    }
  } catch (err) {
    console.error("Error fetching referee keys from Firestore:", err);
  }
}

export async function getAllApiKeys(): Promise<string[]> {
  await ensureKeysLoaded();
  const envKey = getEnvKey();
  const list = [...GEMINI_KEYS];
  if (envKey && !list.includes(envKey)) list.push(envKey);
  if (list.length === 0) throw new Error("No API keys configured");
  return list;
}
/**
 * Health-aware round-robin over the pooled referee API keys. Shared by every
 * caller (ask path, season-identity generation) so no path pins keys[0] or
 * burns a cooled-down key. Returns null when every key is cooling or the
 * pool is empty; callers must treat null as "try later", never as fatal.
 */
export async function acquireApiKey(): Promise<string | null> {
  const keys = await getAllApiKeys();
  const available = keyHealthFor(keys).available(keys);
  if (!available.length) return null;
  return available[randomStart(available.length)];
}

