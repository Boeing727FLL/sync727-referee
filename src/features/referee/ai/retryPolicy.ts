export type FailureKind = 'aborted' | 'invalid-key' | 'quota' | 'request' | 'server' | 'transient';
export type RetryDecision = { kind: FailureKind; tryNextKey: boolean; tryNextModel: boolean; cooldownMs: number };

const INVALID_KEY_COOLDOWN_MS = 15 * 60_000;
const QUOTA_COOLDOWN_MS = 60_000;

export function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && error.message) return String(error.message);
  try { return typeof error === 'string' ? error : JSON.stringify(error) || String(error); }
  catch { return String(error); }
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
    return { kind: 'quota', tryNextKey: true, tryNextModel: true, cooldownMs: QUOTA_COOLDOWN_MS };
  }
  if (lower.includes('400') && ['schema', 'model', 'unsupported', 'not found', 'input format', 'unknown field', 'invalid argument', 'not enabled'].some(value => lower.includes(value))) {
    return { kind: 'request', tryNextKey: false, tryNextModel: true, cooldownMs: 0 };
  }
  if (['500', '502', '503', '504', 'internal server error', 'service unavailable'].some(value => lower.includes(value))) {
    return { kind: 'server', tryNextKey: false, tryNextModel: true, cooldownMs: 0 };
  }
  return { kind: 'transient', tryNextKey: false, tryNextModel: false, cooldownMs: 0 };
}

/** In-memory key cooldowns. Values and identifiers never leave this instance. */
export class KeyHealth {
  private readonly retryAfter = new Map<string, number>();

  available(keys: string[], now = Date.now()): string[] {
    this.prune(now);
    return keys.filter(key => (this.retryAfter.get(key) || 0) <= now);
  }

  coolDown(key: string, durationMs: number, now = Date.now()): void {
    if (durationMs > 0 && key !== 'proxy-key') this.retryAfter.set(key, now + durationMs);
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
