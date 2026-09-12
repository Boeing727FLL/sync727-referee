/**
 * chatQuota.ts — server-enforced daily question budget (no backend needed).
 *
 * WHAT: each answered question consumes one unit from `chat_quota/{uid}`
 * ({count, windowStart}). Firestore rules enforce strictly-+1 increments
 * inside a rolling 24h window with a hard cap, so deleting localStorage or
 * switching devices cannot dodge the budget. Analytics-style failures never
 * break the app, but a DENIED quota write must block the question.
 */
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

/** Max answered questions per user per rolling 24h window. */
export const DAILY_CHAT_LIMIT = 100;

const DAY_MS = 24 * 3600 * 1000;

/** Consume one unit. Throws a Hebrew message when the budget is exhausted. */
export async function consumeChatQuota(uid: string): Promise<void> {
  if (!uid) return;
  const ref = doc(db, 'chat_quota', uid);
  // Staged rollout: the quota collection only exists once the new security
  // rules are deployed. Until then (or offline) reads fail — stay out of the
  // way and let the question through, exactly like before the quota existed.
  try {
    await getDoc(ref);
  } catch (error: any) {
    console.warn('chatQuota unavailable (rules not deployed yet, or offline) — continuing without budget.');
    return;
  }
  try {
    await runTransaction(db, async (tx) => {
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
      if (count >= DAILY_CHAT_LIMIT) throw new Error('DAILY_QUOTA_EXHAUSTED');
      tx.update(ref, { count: count + 1 });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DAILY_QUOTA_EXHAUSTED') {
      throw new Error(`הגעתם למכסת השאלות היומית (${DAILY_CHAT_LIMIT}). נסו שוב מחר.`);
    }
    // Rules denial (e.g. tampered count) also lands here: block the question
    // instead of letting quota writes fail open.
    throw new Error(`הגעתם למכסת השאלות היומית (${DAILY_CHAT_LIMIT}). נסו שוב מחר.`);
  }
}
