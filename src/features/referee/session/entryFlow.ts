/**
 * Entry flow state machine: intro -> disclaimer -> chat.
 *
 * The page used to track this with five booleans (showIntro, chatStarted,
 * showDisclaimer, pendingEnterChat, typewriterReady) whose combinations
 * could contradict (e.g. intro and disclaimer both visible). The stage
 * plus two flags here are the single source of truth.
 */

export type EntryStage =
  /** The intro takeover is up; the chat sits behind it, not started. */
  | 'intro'
  /** The mandatory disclaimer floats over an already-mounted chat. */
  | 'disclaimer'
  /** The chat is live and the typewriter may run. */
  | 'chat';

export interface EntryState {
  stage: EntryStage;
  /** Arrived via ?enter=chat: the URL still needs cleaning on confirm. */
  pendingEnterChat: boolean;
  /** The disclaimer was accepted at least once this mount. */
  typewriterReady: boolean;
}

/** First paint: ?enter=chat + saved session lands directly on the disclaimer. */
export function initialEntryState(autoEnter: boolean): EntryState {
  return autoEnter
    ? { stage: 'disclaimer', pendingEnterChat: true, typewriterReady: false }
    : { stage: 'intro', pendingEnterChat: false, typewriterReady: false };
}

/**
 * The intro CTA: a live session goes to the disclaimer; everyone else is
 * routed to the login page (navigation is the caller's side effect).
 */
export function introContinue(state: EntryState, sessionAlive: boolean): { next: EntryState; navigateToLogin: boolean } {
  if (state.stage !== 'intro') return { next: state, navigateToLogin: false };
  if (!sessionAlive) return { next: state, navigateToLogin: true };
  return { next: { ...state, stage: 'disclaimer' }, navigateToLogin: false };
}

/** Disclaimer accepted: the chat is fully live, URL-cleaning flag consumed. */
export function disclaimerConfirm(state: EntryState): EntryState {
  if (state.stage !== 'disclaimer') return state;
  return { stage: 'chat', pendingEnterChat: false, typewriterReady: true };
}

/** The landing walked intro -> login -> disclaimer itself and mounts the
 *  chat directly live (embedded same-page flow): no intro, no gate,
 *  typewriter allowed from the first frame. */
export function enteredChatState(): EntryState {
  return { stage: 'chat', pendingEnterChat: false, typewriterReady: true };
}

/** Sign-out / kick / account deletion: everything back to a fresh intro. */
export function exitToIntro(): EntryState {
  return { stage: 'intro', pendingEnterChat: false, typewriterReady: false };
}

/** ?enter=chat arriving while mounted with a live session. */
export function enterFromUrl(state: EntryState): EntryState {
  return { ...state, stage: 'disclaimer', pendingEnterChat: true };
}

// ---- Derived view booleans (what the render tree reads) --------------------

export const showIntro = (s: EntryState) => s.stage === 'intro';
export const chatStarted = (s: EntryState) => s.stage !== 'intro';
export const showDisclaimer = (s: EntryState) => s.stage === 'disclaimer';
