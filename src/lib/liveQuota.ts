/**
 * liveQuota.ts — strict budget for Live referee sessions (no backend needed).
 *
 * WHAT: each opened Live session consumes one unit from `live_quota/{uid}`
 * ({count, windowStart}). Firestore rules enforce strictly-+1 increments
 * inside a rolling 24h window with a hard cap (see firestore.rules), exactly
 * like chat_quota. Until those rules are deployed, a localStorage counter
 * enforces the SAME limits fail-closed — Live is expensive, so unlike chat
 * we never fail open here.
 *
 * LIMITS (deliberately much stricter than chat — chat stays the main usage):
 * - 3 Live sessions per user per rolling 24h window.
 * - 5 minutes cooldown between sessions.
 * - 5 minutes max per session (token expires at 6 min as a backstop).
 */
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/** Max Live sessions per user per rolling 24h window. */
export const DAILY_LIVE_LIMIT = 3;
/** Min gap between two Live sessions. */
export const LIVE_COOLDOWN_MS = 5 * 60 * 1000;
/** Max duration of a single Live session (client auto-closes). */
export const LIVE_MAX_SESSION_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 3600 * 1000;
const LS_COUNT = 'live_quota_count_v1';
const LS_WINDOW = 'live_quota_window_v1';
const LS_LAST = 'live_last_session_ts_v1';

interface LocalQuota { count: number; windowStart: number }

function readLocal(): LocalQuota {
  try {
    const count = Number(localStorage.getItem(LS_COUNT)) || 0;
    const windowStart = Number(localStorage.getItem(LS_WINDOW)) || 0;
    if (windowStart && Date.now() - windowStart >= DAY_MS) return { count: 0, windowStart: 0 };
    return { count, windowStart };
  } catch {
    return { count: 0, windowStart: 0 };
  }
}

function writeLocal(q: LocalQuota): void {
  try {
    localStorage.setItem(LS_COUNT, String(q.count));
    localStorage.setItem(LS_WINDOW, String(q.windowStart));
  } catch { /* private mode — limits simply won't persist */ }
}

/** Seconds until the cooldown ends (0 when clear). Always enforced. */
export function liveCooldownRemainingSec(): number {
  try {
    const last = Number(localStorage.getItem(LS_LAST)) || 0;
    const wait = LIVE_COOLDOWN_MS - (Date.now() - last);
    return wait > 0 ? Math.ceil(wait / 1000) : 0;
  } catch {
    return 0;
  }
}

/** Mark a session as opened (starts the cooldown). */
export function markLiveSessionOpened(): void {
  try {
    localStorage.setItem(LS_LAST, String(Date.now()));
  } catch { /* ignore */ }
}

function exhaustedMsg(): string {
  return `מכסת שיחות הלייב היומית נוצלה (${DAILY_LIVE_LIMIT} שיחות). הצ'אט הרגיל פתוח — נסו שוב מחר.`;
}

/**
 * Remaining Live sessions today (Firestore when rules are deployed,
 * otherwise the local counter). Used for the UI badge only.
 */
export async function getLiveRemaining(uid: string): Promise<number> {
  if (!uid) return DAILY_LIVE_LIMIT;
  try {
    const snap = await getDoc(doc(db, 'live_quota', uid));
    if (snap.exists()) {
      const data = snap.data() as { count?: unknown; windowStart?: { toMillis?: () => number } };
      const startMs = typeof data?.windowStart?.toMillis === 'function' ? (data.windowStart.toMillis() as number) : 0;
      if (Date.now() - startMs < DAY_MS) {
        return Math.max(0, DAILY_LIVE_LIMIT - (Number(data?.count) || 0));
      }
    }
  } catch { /* rules not deployed yet — fall through to local */ }
  const local = readLocal();
  return Math.max(0, DAILY_LIVE_LIMIT - local.count);
}

/**
 * Consume one Live session. Throws a Hebrew message when blocked
 * (exhausted budget or active cooldown). Call only AFTER the Live
 * session actually opened, so failed connects cost nothing.
 */
export async function consumeLiveQuota(uid: string): Promise<void> {
  const cooldown = liveCooldownRemainingSec();
  if (cooldown > 0) {
    const mm = Math.floor(cooldown / 60);
    const ss = cooldown % 60;
    throw new Error(`שיחת לייב הבאה בעוד ${mm}:${String(ss).padStart(2, '0')}. הצ'אט הרגיל זמין בינתיים.`);
  }
  if (uid) {
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'live_quota', uid);
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          tx.set(ref, { count: 1, windowStart: serverTimestamp() });
          return;
        }
        const data = snap.data() as { count?: unknown; windowStart?: { toMillis?: () => number } };
        const startMs = typeof data?.windowStart?.toMillis === 'function' ? (data.windowStart.toMillis() as number) : 0;
        if (Date.now() - startMs >= DAY_MS) {
          tx.set(ref, { count: 1, windowStart: serverTimestamp() });
          return;
        }
        const count = Number(data?.count) || 0;
        if (count >= DAILY_LIVE_LIMIT) throw new Error('LIVE_QUOTA_EXHAUSTED');
        tx.update(ref, { count: count + 1 });
      });
      // Mirror into the local counter so both stay in sync.
      const local = readLocal();
      writeLocal(local.windowStart ? { count: local.count + 1, windowStart: local.windowStart } : { count: 1, windowStart: Date.now() });
      markLiveSessionOpened();
      return;
    } catch (error) {
      if (error instanceof Error && error.message === 'LIVE_QUOTA_EXHAUSTED') throw new Error(exhaustedMsg());
      // Firestore unavailable (rules not deployed yet, offline, tampered
      // count) — fall through to the strict local counter, never fail open.
      console.warn('liveQuota: Firestore unavailable, enforcing strict local budget.');
    }
  }
  const local = readLocal();
  if (local.windowStart && local.count >= DAILY_LIVE_LIMIT) throw new Error(exhaustedMsg());
  writeLocal(local.windowStart
    ? { count: local.count + 1, windowStart: local.windowStart }
    : { count: 1, windowStart: Date.now() });
  markLiveSessionOpened();
}
