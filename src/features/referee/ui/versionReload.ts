/**
 * Deploy-version reload policy.
 *
 * A new deployment used to yank the page immediately - mid-answer,
 * mid-typewriter, mid-draft. The reload is now gated on the app being
 * idle: no request streaming, no typewriter rendering, no composer draft.
 */

export interface ReloadGate {
  /** A request is streaming or the typewriter is still rendering. */
  busy: boolean;
  /** The composer holds no draft text. */
  composerEmpty: boolean;
}

/**
 * True only when the server version really differs AND reloading right now
 * cannot destroy anything the user sees or typed.
 */
export function shouldReloadForUpdate(localVersion: string, serverVersion: string, gate: ReloadGate): boolean {
  if (!localVersion || !serverVersion) return false;
  if (localVersion === serverVersion) return false;
  if (gate.busy) return false;
  if (!gate.composerEmpty) return false;
  return true;
}
