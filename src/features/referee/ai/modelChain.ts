/**
 * The ask path's model x key rotation loop, extracted so its retry and
 * rotation semantics are deterministically testable.
 *
 * Order of operations (unchanged from the inline loop this replaced):
 * models advance on the outside, keys rotate inside each model. One
 * rotation index is read and advanced per MODEL iteration (round-robin
 * across sessions via the caller's storage). A failure is classified and
 * either cools the key and tries the next one, skips to the next model,
 * or moves on (unknown failures skip to the next model and are logged). An
 * abort short-circuits everything and is never counted as an answer.
 */
import { classifyFailure, MODEL_OVERLOADED_COOLDOWN_MS, rotateCandidates, type FailureKind, type KeyHealth } from './retryPolicy';

/** Backoff before a same-model retry after a 5xx (only used when SERVER_FAILURES_BEFORE_FALLBACK > 1). */
const SERVER_RETRY_BASE_MS = 1_500;
/**
 * Key budget per model: up to MAX_KEYS_PER_MODEL different keys (starting
 * at a random pool position), then the next model. Walking all 100+ keys
 * after 429s turned one question into a flood of full rule-book requests.
 * The key walk on one model also stops after MODEL_TIME_BUDGET_MS.
 */
// Every attempt re-uploads the whole rule book (20+ page images), so one
// failed attempt costs ~10-13s on a phone. 5 keys x 40s per model let one
// question burn ~2.5 minutes before the next model was even tried.
export const MAX_KEYS_PER_MODEL = 3;
export const MODEL_TIME_BUDGET_MS = 25_000;
/** 503 / "high demand" is model-wide: another key on the same model almost
 *  always gets the same answer, so the first one moves to the next model. */
export const SERVER_FAILURES_BEFORE_FALLBACK = 1;

/** Rest after a dropped connection on a model (shorter than overload). */
export const NETWORK_MODEL_COOLDOWN_MS = 60_000;

export type AttemptReport = { model: string; ok: boolean; kind?: FailureKind; ms: number };

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => { signal?.removeEventListener('abort', done); resolve(); }, ms);
    const done = () => { clearTimeout(timer); resolve(); };
    signal?.addEventListener('abort', done, { once: true });
  });
}

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
  /** Stable model id for per-model cooldowns (default String(model)). */
  modelId?: (model: M) => string;
  /** Test seam for the time budget. */
  now?: () => number;
  /** Test seam for the 5xx backoff. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Diagnostics: one report per attempt (never includes the key). */
  onAttempt?: (report: AttemptReport) => void;
}): Promise<ChainOutcome> {
  const { models, keys, health, rotationIndex, onRotation, signal, attempt } = options;
  const idOf = options.modelId ?? ((model: M) => String(model));
  const sleep = options.sleep ?? abortableSleep;
  let lastFailureKind: FailureKind | null = null;
  // Any quota answer means "busy, try in a minute", even if a later model
  // failed differently - the user sees the honest busy message.
  let sawQuota = false;
  const outcomeKind = (): FailureKind | null => (sawQuota ? 'quota' : lastFailureKind);

  const now = options.now ?? Date.now;
  // A model resting after a short overload / dropped-connection rest is
  // tried last instead of skipped: skipping every model right after a bad
  // question turned the next question into an instant "busy" answer.
  // Long rests (no free tier, 6h) are still skipped.
  const shortRest = (model: M) => { const ms = health.modelRestMs(idOf(model)); return ms > 0 && ms <= MODEL_OVERLOADED_COOLDOWN_MS; };
  const ordered_models = [...models.filter(model => !shortRest(model)), ...models.filter(shortRest)];
  modelLoop: for (const model of ordered_models) {
    const modelId = idOf(model);
    const modelStarted = now();
    let serverFailures = 0;
    const available = health.available(keys, Date.now(), modelId, shortRest(model));
    if (!available.length) {
      // Keys cooling on this model only: the next model may still answer.
      lastFailureKind = lastFailureKind ?? 'quota';
      sawQuota = true;
      continue;
    }
    const ordered = rotateCandidates(available, rotationIndex);
    const candidates = ordered.slice(0, MAX_KEYS_PER_MODEL);
    onRotation?.((rotationIndex + 1) % available.length);
    for (const key of candidates) {
      if (now() - modelStarted >= MODEL_TIME_BUDGET_MS) continue modelLoop;
      for (;;) {
        if (signal?.aborted) return { status: 'aborted' };
        const attemptStarted = now();
        try {
          if (await attempt(key, model)) { options.onAttempt?.({ model: modelId, ok: true, ms: now() - attemptStarted }); return { status: 'answered' }; }
          break;
        } catch (error: unknown) {
          const decision = classifyFailure(error, signal?.aborted);
          lastFailureKind = decision.kind;
          options.onAttempt?.({ model: modelId, ok: false, kind: decision.kind, ms: now() - attemptStarted });
          if (decision.kind !== 'aborted') {
            // Every failed attempt is visible in the console (key never logged).
            console.warn(`[referee] ${modelId} attempt failed (${decision.kind}):`, errorMessage(error).slice(0, 300));
          }
          if (decision.kind === 'quota') sawQuota = true;
          if (decision.kind === 'aborted') return { status: 'aborted' };
          if (decision.kind === 'network') {
            // Measured live 2026-09-24: a dropped connection costs ~13s (the
            // rule book upload) and the next key on the same model dropped
            // the same way. Move to the next model and rest this one briefly.
            health.coolDownModel(modelId, NETWORK_MODEL_COOLDOWN_MS);
            continue modelLoop;
          }
          if (decision.kind === 'server') {
            // 503 "overloaded" is model-wide and usually momentary: back
            // off, try once more on a different key, and only then rest the
            // model and fall back.
            serverFailures++;
            if (serverFailures < SERVER_FAILURES_BEFORE_FALLBACK) {
              await sleep(SERVER_RETRY_BASE_MS + Math.floor(Math.random() * 1_000), signal);
              break;
            }
            health.coolDownModel(modelId, MODEL_OVERLOADED_COOLDOWN_MS);
            continue modelLoop;
          }
          if (decision.kind === 'model-unavailable') {
            health.coolDownModel(modelId, decision.cooldownMs);
            continue modelLoop;
          }
          // Invalid keys are dead everywhere; quota is per model.
          health.coolDown(key, decision.cooldownMs, Date.now(), decision.kind === 'quota' ? modelId : undefined);
          if (decision.tryNextKey) break;
          if (decision.tryNextModel) continue modelLoop;
          throw error;
        }
      }
    }
  }
  return { status: 'exhausted', lastFailureKind: outcomeKind() };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try { return typeof error === 'string' ? error : JSON.stringify(error); } catch { return String(error); }
}
