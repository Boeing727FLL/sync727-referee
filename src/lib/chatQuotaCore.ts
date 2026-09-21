/** Pure daily-quota policy shared by the Firestore adapter and deterministic tests. */
export const DAILY_CHAT_LIMIT = 55;
export const CHAT_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ChatQuotaRecord = { count: number; windowStartMs: number };
export type ChatQuotaDecision = {
  allowed: boolean;
  bypassed: boolean;
  next: ChatQuotaRecord | null;
  remaining: number | null;
  resetAtMs: number | null;
};

export function decideChatQuota(options: {
  current: ChatQuotaRecord | null;
  nowMs: number;
  owner: boolean;
}): ChatQuotaDecision {
  const { current, nowMs, owner } = options;
  if (owner) return { allowed: true, bypassed: true, next: current, remaining: null, resetAtMs: null };
  const validCurrent = current && Number.isInteger(current.count) && current.count >= 0 && Number.isFinite(current.windowStartMs)
    ? current : null;
  const expired = !validCurrent || nowMs - validCurrent.windowStartMs >= CHAT_QUOTA_WINDOW_MS;
  const count = expired ? 0 : validCurrent.count;
  const windowStartMs = expired ? nowMs : validCurrent.windowStartMs;
  if (count >= DAILY_CHAT_LIMIT) {
    return { allowed: false, bypassed: false, next: validCurrent, remaining: 0, resetAtMs: windowStartMs + CHAT_QUOTA_WINDOW_MS };
  }
  const next = { count: count + 1, windowStartMs };
  return {
    allowed: true,
    bypassed: false,
    next,
    remaining: DAILY_CHAT_LIMIT - next.count,
    resetAtMs: windowStartMs + CHAT_QUOTA_WINDOW_MS,
  };
}
