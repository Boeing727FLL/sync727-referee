/**
 * The ask path's model x key rotation loop, extracted so its retry and
 * rotation semantics are deterministically testable.
 *
 * Order of operations (unchanged from the inline loop this replaced):
 * models advance on the outside, keys rotate inside each model. One
 * rotation index is read and advanced per MODEL iteration (round-robin
 * across sessions via the caller's storage). A failure is classified and
 * either cools the key and tries the next one, skips to the next model,
 * or propagates (transient/unknown failures are never swallowed). An
 * abort short-circuits everything and is never counted as an answer.
 */
import { classifyFailure, rotateCandidates, type FailureKind, type KeyHealth } from './retryPolicy';

export type ChainOutcome =
  | { status: 'answered' }
  | { status: 'aborted' }
  | { status: 'exhausted'; lastFailureKind: FailureKind | null };

export async function runModelChain<M>(options: {
  models: M[];
  keys: string[];
  health: KeyHealth;
  rotationIndex: number;
  onRotation?: (next: number) => void;
  signal?: AbortSignal;
  /** One full attempt with this key+model. Resolve true when it produced
   *  the final answer (loop stops). Throw provider errors for
   *  classification; never swallow aborts. */
  attempt: (key: string, model: M) => Promise<boolean>;
}): Promise<ChainOutcome> {
  const { models, keys, health, rotationIndex, onRotation, signal, attempt } = options;
  let lastFailureKind: FailureKind | null = null;

  modelLoop: for (const model of models) {
    const available = health.available(keys);
    if (!available.length) {
      lastFailureKind = 'quota';
      break;
    }
    const candidates = rotateCandidates(available, rotationIndex);
    onRotation?.((rotationIndex + 1) % available.length);
    for (const key of candidates) {
      if (signal?.aborted) return { status: 'aborted' };
      try {
        if (await attempt(key, model)) return { status: 'answered' };
      } catch (error: unknown) {
        const decision = classifyFailure(error, signal?.aborted);
        lastFailureKind = decision.kind;
        if (decision.kind === 'aborted') return { status: 'aborted' };
        health.coolDown(key, decision.cooldownMs);
        if (decision.tryNextKey) continue;
        if (decision.tryNextModel) continue modelLoop;
        throw error;
      }
    }
  }
  return { status: 'exhausted', lastFailureKind };
}
