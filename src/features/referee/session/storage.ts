/** Offline login evidence only. Firebase rules remain the authorization gate. */
export function hasSavedRefereeSession(): boolean {
  try {
    return Boolean(localStorage.getItem('google_access_token') || localStorage.getItem('auth_user'));
  } catch { return false; }
}

export function clearRefereeSessionStorage() {
  try {
    for (const key of ['google_access_token', 'auth_user', 'user_picture', 'user_name']) {
      localStorage.removeItem(key);
    }
  } catch { /* Storage unavailable or blocked. */ }
}
