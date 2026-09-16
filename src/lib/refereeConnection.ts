/**
 * Tracks whether the referee has successfully connected at least once in
 * this tab session. The `connecting` think phase is shown only until the
 * first answer arrives — afterwards it is skipped.
 */
const KEY = 'referee_connected_once';

export function hasConnectedOnce(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markConnectedOnce(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Storage unavailable — connecting phase will simply show again.
  }
}
