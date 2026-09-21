/**
 * Chat-surface error copy guard.
 *
 * Raw SDK/network errors are English and technical ("429 RESOURCE_EXHAUSTED
 * ...", "fetch failed") - showing them in a chat bubble breaks trust. Our
 * own services already produce clean Hebrew messages, so the rule is: keep
 * messages that contain Hebrew, hide everything else behind the fallback.
 */
export function safeUserFacingError(error: unknown, fallback: string): string {
  const msg = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof msg !== 'string' || !msg.trim()) return fallback;
  return /[א-ת]/.test(msg) ? msg : fallback;
}
