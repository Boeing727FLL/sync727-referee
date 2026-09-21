/** Global feedback-reset and maintenance flags for the referee app. */
import { onValue, ref, serverTimestamp, set, type DataSnapshot } from 'firebase/database';
import { rtdb } from './firebase/rtdb';

const META_PATH = 'referee/meta';

async function silentWrite(label: string, operation: () => PromiseLike<unknown>): Promise<void> {
  try { await operation(); } catch (error) { console.warn(`${label} failed:`, error); }
}

export async function resetFeedbackForAll(): Promise<void> {
  await silentWrite('resetFeedbackForAll', () => set(ref(rtdb, `${META_PATH}/feedbackResetAt`), serverTimestamp()));
}

export function subscribeFeedbackReset(callback: (resetAtMs: number) => void): () => void {
  return onValue(ref(rtdb, `${META_PATH}/feedbackResetAt`), (snapshot: DataSnapshot) => {
    const value = snapshot.val();
    callback(typeof value === 'number' ? value : 0);
  }, error => console.warn('feedback reset snapshot failed:', error));
}

export async function setMaintenance(on: boolean): Promise<void> {
  await silentWrite('setMaintenance', () => set(ref(rtdb, `${META_PATH}/maintenance`), on));
}

export function subscribeMaintenance(callback: (on: boolean) => void): () => void {
  return onValue(ref(rtdb, `${META_PATH}/maintenance`), (snapshot: DataSnapshot) => callback(snapshot.val() === true), error => console.warn('maintenance snapshot failed:', error));
}

/** Fail closed after repeated read failures so maintenance mode cannot leak the app. */
export function subscribeMaintenanceGate(callback: (on: boolean) => void): () => void {
  const maxFailures = 3;
  const retryMs = 2000;
  let failures = 0;
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const watch = () => {
    if (stopped) return;
    try { unsubscribe?.(); } catch { /* noop */ }
    unsubscribe = onValue(ref(rtdb, `${META_PATH}/maintenance`), snapshot => {
      failures = 0;
      callback(snapshot.val() === true);
    }, error => {
      console.warn('maintenance gate snapshot failed:', error);
      failures++;
      if (failures >= maxFailures) callback(true);
      else retryTimer = setTimeout(watch, retryMs);
    });
  };
  watch();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    try { unsubscribe?.(); } catch { /* noop */ }
  };
}
