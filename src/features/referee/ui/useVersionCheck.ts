/**
 * useVersionCheck - poll the deployed version and reload on a real update.
 *
 * The reload waits for idle (see versionReload.ts): when an update arrives
 * mid-answer or mid-draft it stays pending and is retried on every later
 * tick or visibility return, so it lands at the next quiet moment instead
 * of tearing down a live conversation. Worst-case delay is one poll
 * interval (60s) after the app turns idle.
 */
import { useEffect, useRef } from 'react';
import { shouldReloadForUpdate, type ReloadGate } from './versionReload';

/** First check after mount (ms), then the steady poll interval (ms). */
const FIRST_CHECK_MS = 5000;
const POLL_INTERVAL_MS = 60000;

export function useVersionCheck(gate: ReloadGate): void {
  const gateRef = useRef(gate);
  gateRef.current = gate;

  useEffect(() => {
    // @ts-ignore build-time define, may be absent in some environments
    const localVer = typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : '';
    if (!localVer) return;
    let disposed = false;
    const checkVersion = async () => {
      try {
        const r = await fetch('/version.json?cb=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const serverVer = String(j.version || '');
        if (disposed) return;
        if (shouldReloadForUpdate(localVer, serverVer, gateRef.current)) {
          window.location.reload();
        }
      } catch { /* offline or blocked: the next tick retries */ }
    };
    const t1 = setTimeout(checkVersion, FIRST_CHECK_MS);
    const iv = setInterval(checkVersion, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      disposed = true;
      clearTimeout(t1);
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}
