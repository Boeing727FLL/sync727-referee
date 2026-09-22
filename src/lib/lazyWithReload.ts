/**
 * Lazy import with one self-healing reload.
 *
 * A deploy replaces every hashed chunk; a tab opened before it can hold a
 * page whose next lazy import 404s (stale chunk). Without recovery the user
 * lands on the error boundary and must discover the reload button. On the
 * first failure for a chunk we reload once - the fresh index.html points at
 * fresh chunks - and only surface the error if it persists after that.
 */
import { lazy, type ComponentType } from 'react';

const RELOAD_KEY_PREFIX = 'chunk-reload:';

/** Indirection so tests can observe the reload without touching window.location. */
let reloadPage = () => window.location.reload();
export function setReloadPageForTests(fn: (() => void) | null) {
  reloadPage = fn || (() => window.location.reload());
}

export async function importWithReload<T>(
  name: string,
  factory: () => Promise<T>,
): Promise<T> {
  try {
    const value = await factory();
    // A healthy load after a recovered failure re-arms the one-shot reload.
    try { sessionStorage.removeItem(RELOAD_KEY_PREFIX + name); } catch { /* ignore */ }
    return value;
  } catch (error) {
    try {
      const key = RELOAD_KEY_PREFIX + name;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        reloadPage();
        // Keep the Suspense fallback up while the reload happens.
        return new Promise<T>(() => {});
      }
    } catch { /* Storage blocked: fall through to the boundary. */ }
    throw error;
  }
}

export function lazyWithReload<T extends ComponentType<any>>(
  name: string,
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() => importWithReload(name, factory));
}

/** Test hook: forget the one-shot reload markers. */
export function resetChunkReloadMarkers() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(RELOAD_KEY_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch { /* ignore */ }
}
