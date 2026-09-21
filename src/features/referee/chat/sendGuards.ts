/**
 * Send preflight guard chain (pure decisions).
 *
 * handleSend echoes the user's bubble optimistically, then walks these
 * guards in order. The first rejection wins and its notice is shown as a
 * model bubble while the exact draft is restored. Only 'proceed' reaches
 * the model. The side-effecting checks (rate-limit counter, server quota)
 * are performed by the caller; this module owns the decision logic so the
 * chain order and messages are test-locked.
 */

type GuardDecision =
  | { kind: 'proceed' }
  | { kind: 'reject'; notice: string };

interface GuardInput {
  /** Number of active rulebook sources loaded for this request. */
  rulebookCount: number;
  /** Fast browser anti-spam check result. */
  clientLimit: { allowed: boolean; reason?: 'cooldown' | 'hourly' };
  /** Server daily-quota outcome (null = consumed or user has no uid). */
  quotaError: { exhausted: boolean; resetAtMs?: number | null } | null;
}

export interface GuardCopy {
  rulebookLoadFailed: string;
  noRulebook: string;
  cooldown: string;
  hourlyLimit: string;
  genericRateLimited: string;
  quotaExhausted: string;
  quotaUnavailable: string;
}

export function decideSendPreflight(input: GuardInput, copy: GuardCopy): GuardDecision {
  if (input.rulebookCount === 0) return { kind: 'reject', notice: copy.noRulebook };
  if (!input.clientLimit.allowed) {
    return {
      kind: 'reject',
      notice: input.clientLimit.reason === 'cooldown'
        ? copy.cooldown
        : input.clientLimit.reason === 'hourly'
          ? copy.hourlyLimit
          : copy.genericRateLimited,
    };
  }
  if (input.quotaError) {
    return {
      kind: 'reject',
      notice: input.quotaError.exhausted ? copy.quotaExhausted : copy.quotaUnavailable,
    };
  }
  return { kind: 'proceed' };
}
