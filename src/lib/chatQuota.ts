/**
 * Firestore-backed referee request budget.
 *
 * A unit is reserved atomically before any provider work begins. Reservations
 * are deliberately not refunded on abort/provider failure: a client-controlled
 * refund would let anyone bypass the cap by aborting after the provider accepted
 * the request. Internal model/key retries remain part of one reservation.
 */
import { doc, onSnapshot, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db } from './firebase/firestore';
import { CHAT_QUOTA_WINDOW_MS, DAILY_CHAT_LIMIT, decideChatQuota } from './chatQuotaCore';
import { auth } from './firebase/auth';
import { OWNER_EMAIL } from './owner';

export { DAILY_CHAT_LIMIT } from './chatQuotaCore';

export type ChatQuotaStatus = { remaining: number; limit: number; resetAtMs: number | null };
export class ChatQuotaExhaustedError extends Error {
  resetAtMs: number | null;
  constructor(resetAtMs: number | null) {
    super('DAILY_QUOTA_EXHAUSTED');
    this.name = 'ChatQuotaExhaustedError';
    this.resetAtMs = resetAtMs;
  }
}

function millis(value: unknown): number {
  return value && typeof (value as Timestamp).toMillis === 'function' ? (value as Timestamp).toMillis() : 0;
}

/** Reserve one request. Firestore retries transaction conflicts atomically. */
export async function consumeChatQuota(uid: string, nowMs = Date.now()): Promise<ChatQuotaStatus | null> {
  const signedIn = auth.currentUser;
  const verifiedOwner = signedIn?.uid === uid && signedIn.emailVerified && signedIn.email?.trim().toLowerCase() === OWNER_EMAIL;
  if (!uid || verifiedOwner) return null;
  const quotaRef = doc(db, 'chat_quota', uid);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(quotaRef);
    const data = snapshot.exists() ? snapshot.data() : null;
    const decision = decideChatQuota({
      current: data ? { count: Number(data.count), windowStartMs: millis(data.windowStart) } : null,
      nowMs,
      owner: false,
    });
    if (!decision.allowed || !decision.next) throw new ChatQuotaExhaustedError(decision.resetAtMs);
    if (!snapshot.exists() || decision.next.windowStartMs === nowMs) {
      tx.set(quotaRef, { count: decision.next.count, windowStart: serverTimestamp() });
    } else {
      tx.update(quotaRef, { count: decision.next.count });
    }
    return { remaining: decision.remaining!, limit: DAILY_CHAT_LIMIT, resetAtMs: decision.resetAtMs };
  });
}

/** Live cross-device status for the composer. Owner has no quota indicator. */
export function subscribeChatQuota(uid: string, onChange: (status: ChatQuotaStatus | null) => void): () => void {
  const signedIn = auth.currentUser;
  const verifiedOwner = signedIn?.uid === uid && signedIn.emailVerified && signedIn.email?.trim().toLowerCase() === OWNER_EMAIL;
  if (!uid || verifiedOwner) { onChange(null); return () => {}; }
  return onSnapshot(doc(db, 'chat_quota', uid), snapshot => {
    if (!snapshot.exists()) { onChange({ remaining: DAILY_CHAT_LIMIT, limit: DAILY_CHAT_LIMIT, resetAtMs: null }); return; }
    const data = snapshot.data();
    const start = millis(data.windowStart);
    const expired = !start || Date.now() - start >= CHAT_QUOTA_WINDOW_MS;
    onChange({
      remaining: expired ? DAILY_CHAT_LIMIT : Math.max(0, DAILY_CHAT_LIMIT - (Number(data.count) || 0)),
      limit: DAILY_CHAT_LIMIT,
      resetAtMs: expired ? null : start + CHAT_QUOTA_WINDOW_MS,
    });
  }, () => onChange(null));
}
