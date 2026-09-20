/**
 * Browser-side anti-spam guard. This improves UX but is not a security gate;
 * Firestore's daily quota transaction remains authoritative.
 */
const RATE_GAP_MS = 4_000;
const RATE_HOURLY_MAX = 120;
const LAST_SEND_KEY = 'referee_last_send';
const HOUR_BUCKET_KEY = 'referee_hour_bucket';

export type RateLimitResult = { allowed: boolean; message?: string };

export function consumeClientRateLimit(now = Date.now()): RateLimitResult {
  try {
    const lastSend = Number(localStorage.getItem(LAST_SEND_KEY) || 0);
    if (now - lastSend < RATE_GAP_MS) {
      return { allowed: false, message: 'חכו כמה שניות בין שאלה לשאלה.' };
    }
    const hour = new Date(now).toISOString().slice(0, 13);
    const raw = localStorage.getItem(HOUR_BUCKET_KEY);
    let count = 0;
    if (raw) {
      try {
        const bucket = JSON.parse(raw);
        if (bucket.hour === hour) count = Number(bucket.count) || 0;
      } catch { count = 0; }
    }
    if (count >= RATE_HOURLY_MAX) {
      return { allowed: false, message: 'הגעתם למכסת השאלות לשעה הקרובה. נסו שוב מאוחר יותר.' };
    }
    localStorage.setItem(LAST_SEND_KEY, String(now));
    localStorage.setItem(HOUR_BUCKET_KEY, JSON.stringify({ hour, count: count + 1 }));
  } catch { /* Storage unavailable: server quota still protects usage. */ }
  return { allowed: true };
}

/** Refund only the client guard after Stop. Server quota semantics are separate. */
export function refundClientRateLimit(now = Date.now()) {
  try {
    localStorage.removeItem(LAST_SEND_KEY);
    const hour = new Date(now).toISOString().slice(0, 13);
    const raw = localStorage.getItem(HOUR_BUCKET_KEY);
    if (!raw) return;
    const bucket = JSON.parse(raw);
    if (bucket.hour !== hour) return;
    localStorage.setItem(HOUR_BUCKET_KEY, JSON.stringify({
      hour,
      count: Math.max(0, (Number(bucket.count) || 0) - 1),
    }));
  } catch { /* Storage unavailable. */ }
}
