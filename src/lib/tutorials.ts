/**
 * tutorials.ts — feature-tutorial system (like any modern site's onboarding).
 *
 * WHAT: versioned tutorial definitions shown once per feature. Completing
 * the last step (which may hold T&C) marks the tutorial done for its
 * version — bumping `version` re-shows it. `resetTutorials()` (wired to
 * Settings) clears everything so all tutorials show again.
 * State lives in localStorage; a tutorial never blocks the app when
 * storage is unavailable (it simply shows again).
 */
export interface TutorialStepDef {
  icon: 'photo' | 'tips' | 'terms' | 'team';
  titleKey: string;
  bodyKey?: string;
  /** Last step doubles as the T&C gate: only "accept" completes it. */
  terms?: boolean;
  /** Interactive step: primary button runs a named in-app action. */
  ctaKey?: string;
  ctaAction?: 'open-team';
}

export interface TutorialDef {
  id: string;
  version: number;
  steps: TutorialStepDef[];
}

export const TUTORIALS: Record<string, TutorialDef> = {
  'photo-questions': {
    id: 'photo-questions',
    version: 1,
    steps: [
      { icon: 'photo', titleKey: 'tut.photo.title1', bodyKey: 'tut.photo.body1' },
      { icon: 'tips', titleKey: 'tut.photo.title2', bodyKey: 'tut.photo.body2' },
      { icon: 'terms', titleKey: 'tut.photo.title3', bodyKey: 'tut.photo.tc', terms: true },
    ],
  },
  'team-space': {
    id: 'team-space',
    version: 1,
    steps: [
      { icon: 'team', titleKey: 'tut.team.title1', bodyKey: 'tut.team.body1' },
      { icon: 'tips', titleKey: 'tut.team.title2', bodyKey: 'tut.team.body2' },
      { icon: 'team', titleKey: 'tut.team.title3', ctaKey: 'tut.team.cta', ctaAction: 'open-team' },
    ],
  },
};

/** Proactive order: first unseen tutorial wins. */
export const TUTORIAL_ORDER = ['photo-questions', 'team-space'];

const KEY = 'referee_tutorials_v1';

type TutorialState = Record<string, { version: number; done: boolean }>;

function readState(): TutorialState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state: TutorialState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

/** True when this tutorial was completed for its current version. */
export function isTutorialDone(id: string): boolean {
  try {
    const def = TUTORIALS[id];
    if (!def) return true;
    const entry = readState()[id];
    return !!entry && entry.done === true && entry.version === def.version;
  } catch {
    return false;
  }
}

/** Mark completed (accepts the T&C when the last step holds it). */
export function completeTutorial(id: string): void {
  try {
    const def = TUTORIALS[id];
    if (!def) return;
    const state = readState();
    state[id] = { version: def.version, done: true };
    writeState(state);
  } catch {}
}

/** Clear all tutorial state — everything shows again. */
export function resetTutorials(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
