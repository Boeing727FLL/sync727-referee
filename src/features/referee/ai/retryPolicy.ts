export type FailureKind = 'aborted' | 'invalid-key' | 'quota' | 'model-unavailable' | 'request' | 'server' | 'network' | 'transient';
export type RetryDecision = { kind: FailureKind; tryNextKey: boolean; tryNextModel: boolean; cooldownMs: number };

const INVALID_KEY_COOLDOWN_MS = 15 * 60_000;
const QUOTA_COOLDOWN_MS = 60_000;
/** A model the key's tier cannot use at all (free tier "limit: 0"). */
export const MODEL_UNAVAILABLE_COOLDOWN_MS = 6 * 60 * 60_000;
/** A model that answered 503 twice is overloaded for everyone: rest it briefly. */
export const MODEL_OVERLOADED_COOLDOWN_MS = 30_000;

export function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && error.message) return String(error.message);
  try { return typeof error === 'string' ? error : JSON.stringify(error) || String(error); }
  catch { return String(error); }
}

/** Google's free-tier daily quotas reset at midnight Pacific time. */
export function msUntilDailyReset(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
  const elapsed = ((get('hour') % 24) * 3600 + get('minute') * 60 + get('second')) * 1000;
  return Math.max(60_000, 24 * 3600_000 - elapsed);
}

/** Server-suggested wait ("retryDelay": "23s" / "Please retry in 23.5s"), if any. */
export function retryDelayMs(message: string): number | null {
  const match = message.match(/retry(?:Delay)?["']?\s*(?:in|:)?\s*["']?(\d+(?:\.\d+)?)\s*s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

export function classifyFailure(error: unknown, aborted = false): RetryDecision {
  if (aborted || (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) {
    return { kind: 'aborted', tryNextKey: false, tryNextModel: false, cooldownMs: 0 };
  }
  const message = errorText(error);
  const lower = message.toLowerCase();
  if (['403', '401', 'leaked', 'permission_denied', 'api key not valid', 'api_key_invalid'].some(value => lower.includes(value))) {
    return { kind: 'invalid-key', tryNextKey: true, tryNextModel: true, cooldownMs: INVALID_KEY_COOLDOWN_MS };
  }
  if (['429', 'too many requests', 'quota exceeded', 'resource_exhausted'].some(value => lower.includes(value))) {
    // "limit: 0" means this tier has no quota for the model at all: waiting
    // a minute or trying the other keys only produces more 429s.
    if (/limit:\s*0\b/.test(lower) || lower.includes('not available on the free tier') || lower.includes('free_tier') && lower.includes('limit: 0')) {
      return { kind: 'model-unavailable', tryNextKey: false, tryNextModel: true, cooldownMs: MODEL_UNAVAILABLE_COOLDOWN_MS };
    }
    // Daily cap (RPD): this key+model is done until Google's reset, so
    // retrying it every minute all day only adds 429s. Per-minute caps use
    // the server's retryDelay when it gives one.
    if (lower.includes('perday') || lower.includes('per day') || lower.includes('per_day')) {
      return { kind: 'quota', tryNextKey: true, tryNextModel: true, cooldownMs: msUntilDailyReset() };
    }
    return { kind: 'quota', tryNextKey: true, tryNextModel: true, cooldownMs: Math.min(Math.max(retryDelayMs(message) ?? QUOTA_COOLDOWN_MS, 5_000), 10 * 60_000) };
  }
  if (lower.includes('400') && ['schema', 'model', 'unsupported', 'not found', 'input format', 'unknown field', 'invalid argument', 'not enabled'].some(value => lower.includes(value))) {
    return { kind: 'request', tryNextKey: false, tryNextModel: true, cooldownMs: 0 };
  }
  if (['500', '502', '503', '504', 'internal server error', 'service unavailable'].some(value => lower.includes(value))) {
    return { kind: 'server', tryNextKey: false, tryNextModel: true, cooldownMs: 0 };
  }
  // The request never got an HTTP answer (dropped connection, CORS-less
  // edge error). Another key/connection usually works; this used to end the
  // whole ask with "תקלה זמנית" without trying anything else.
  if (['failed to fetch', 'networkerror', 'network error', 'load failed', 'fetch failed', 'err_'].some(value => lower.includes(value))) {
    return { kind: 'network', tryNextKey: true, tryNextModel: true, cooldownMs: 0 };
  }
  return { kind: 'transient', tryNextKey: false, tryNextModel: false, cooldownMs: 0 };
}

/**
 * In-memory key cooldowns. Values and identifiers never leave this instance.
 * Quotas are per key AND per model, so a cooldown can be scoped to one
 * model: a key out of quota on one model still answers on the others.
 * A model-wide entry (every key) covers overload and no-free-tier models.
 */
type HealthStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type HealthStore = { storage: HealthStorage; name: string; idOf: (id: string) => string; fromId: (stored: string) => string | null };

export class KeyHealth {
  private readonly retryAfter = new Map<string, number>();

  /**
   * Optional persistence: cooldowns survive a page refresh, so a reload no
   * longer re-hits every key that was just told to wait. Entries are keyed
   * by an opaque id the caller derives (never the key value itself).
   */
  private readonly store?: HealthStore;

  constructor(store?: HealthStore) {
    this.store = store;
    if (!store) return;
    try {
      const saved = JSON.parse(store.storage.getItem(store.name) || '{}') as Record<string, number>;
      const now = Date.now();
      for (const [stored, until] of Object.entries(saved)) {
        const id = store.fromId(stored);
        if (id !== null && typeof until === 'number' && until > now) this.retryAfter.set(id, until);
      }
    } catch { /* corrupt cache: start clean */ }
  }

  private persist(): void {
    if (!this.store) return;
    try {
      const out: Record<string, number> = {};
      for (const [id, until] of this.retryAfter) out[this.store.idOf(id)] = until;
      this.store.storage.setItem(this.store.name, JSON.stringify(out));
    } catch { /* storage full/blocked: in-memory still works */ }
  }

  available(keys: string[], now = Date.now(), model?: string): string[] {
    this.prune(now);
    const until = (id: string) => this.retryAfter.get(id) || 0;
    if (model !== undefined && until(`*\u0000${model}`) > now) return [];
    return keys.filter(key => until(key) <= now && (model === undefined || until(`${key}\u0000${model}`) <= now));
  }

  coolDown(key: string, durationMs: number, now = Date.now(), model?: string): void {
    if (durationMs <= 0 || key === 'proxy-key') return;
    const id = model === undefined ? key : `${key}\u0000${model}`;
    this.retryAfter.set(id, Math.max(this.retryAfter.get(id) || 0, now + durationMs));
    this.persist();
  }

  coolDownModel(model: string, durationMs: number, now = Date.now()): void {
    if (durationMs > 0) { this.retryAfter.set(`*\u0000${model}`, now + durationMs); this.persist(); }
  }

  nextRetryAt(keys: string[]): number | null {
    const times = keys.map(key => this.retryAfter.get(key)).filter((value): value is number => typeof value === 'number');
    return times.length ? Math.min(...times) : null;
  }

  private prune(now: number): void {
    for (const [key, retryAt] of this.retryAfter) if (retryAt <= now) this.retryAfter.delete(key);
  }
}

/** Rotates the candidate order without exposing or copying key values elsewhere. */
export function rotateCandidates<T>(values: T[], index: number): T[] {
  if (!values.length) return [];
  const offset = ((index % values.length) + values.length) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}
