/**
 * Request lifecycle state machine.
 *
 * One send used to be tracked by three independent booleans
 * (sending / requestFinished / stopHandled) that could contradict each
 * other - e.g. a stopped request whose late resolution flipped "finished"
 * back on, or a double submit racing through a stale closure. The phases
 * and transitions here are the single source of truth; every illegal
 * transition is a no-op, and a monotonic request id makes late events from
 * a dead request ignorable.
 */

type RequestPhase =
  /** No send in flight; the composer may submit. */
  | 'idle'
  /** Optimistic bubble is up; preflight guards are running. */
  | 'preflight'
  /** Guard-passed; the model stream is live. */
  | 'streaming'
  /** Stream completed; the typewriter owns the response. */
  | 'rendering';

export interface RequestMachine {
  phase: RequestPhase;
  /** Bumped on every accepted send; stale async tails compare against it. */
  requestId: number;
  /** Stop was already applied to the current request (idempotent Stop). */
  stopHandled: boolean;
}

export const initialRequestMachine: RequestMachine = {
  phase: 'idle',
  requestId: 0,
  stopHandled: false,
};

/** idle -> preflight. Any other phase rejects the send (duplicate guard). */
export function beginSend(m: RequestMachine): { next: RequestMachine; started: boolean } {
  if (m.phase !== 'idle') return { next: m, started: false };
  return {
    next: { phase: 'preflight', requestId: m.requestId + 1, stopHandled: false },
    started: true,
  };
}

/** preflight -> streaming, once the guards passed. */
export function beginStream(m: RequestMachine): RequestMachine {
  if (m.phase !== 'preflight' || m.stopHandled) return m;
  return { ...m, phase: 'streaming' };
}

/** streaming -> rendering, when the full response is in. */
export function completeStream(m: RequestMachine): RequestMachine {
  if (m.phase !== 'streaming' || m.stopHandled) return m;
  return { ...m, phase: 'rendering' };
}

/**
 * Stop the current request. Idempotent: the second click (or the late
 * settlement of the aborted stream) changes nothing. The phase returns to
 * idle so a fresh send is immediately possible; stopHandled stays latched
 * so the dead request's late events are still recognized as stopped.
 */
export function applyStop(m: RequestMachine): { next: RequestMachine; tookEffect: boolean } {
  if (m.phase === 'idle' || m.stopHandled) return { next: m, tookEffect: false };
  return { next: { ...m, phase: 'idle', stopHandled: true }, tookEffect: true };
}

/** The typewriter finished rendering: rendering -> idle. */
export function finishRender(m: RequestMachine): RequestMachine {
  if (m.phase !== 'rendering') return m;
  return { ...m, phase: 'idle' };
}

/**
 * The send's async tail settled (finally block). Outside the rendering
 * phase the request is over: back to idle. During rendering the typewriter
 * owns completion, so nothing changes.
 */
export function settle(m: RequestMachine): RequestMachine {
  if (m.phase === 'rendering') return m;
  return { ...m, phase: 'idle' };
}

/** Preflight rejected: the optimistic echo is rolled back by the caller. */
export function rejectPreflight(m: RequestMachine): RequestMachine {
  if (m.phase !== 'preflight') return m;
  return { ...m, phase: 'idle' };
}
