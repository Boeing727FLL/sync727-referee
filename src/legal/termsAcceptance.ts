/**
 * One-time Terms of Use acceptance, stored per user on users/{uid}
 * (termsVersion + termsAcceptedAt) and cached in localStorage so the gate
 * never flashes for someone who already accepted on this device.
 * Bump TERMS_VERSION to ask everyone again after a material change.
 */
export const TERMS_VERSION = '2026-09';
const key = (uid: string) => `terms_accepted:${uid}`;

export function savedUid(): string | null {
  try {
    const p = JSON.parse(localStorage.getItem('auth_user') || '{}');
    if (p?.uid) return String(p.uid);
    const k = Object.keys(localStorage).find(x => x.startsWith('firebase:authUser:'));
    if (k) { const u = JSON.parse(localStorage.getItem(k) || '{}'); if (u?.uid) return String(u.uid); }
  } catch { /* storage blocked */ }
  return null;
}

export function acceptedLocally(uid: string | null = savedUid()): boolean {
  if (!uid) return false;
  try { return localStorage.getItem(key(uid)) === TERMS_VERSION; } catch { return false; }
}

function markLocal(uid: string) {
  try { localStorage.setItem(key(uid), TERMS_VERSION); } catch { /* storage blocked */ }
}

async function currentUid(): Promise<string | null> {
  const { auth } = await import('../lib/firebase/auth');
  if (auth.currentUser) return auth.currentUser.uid;
  const { onAuthStateChanged } = await import('firebase/auth');
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, u => { stop(); resolve(u?.uid ?? null); });
  });
}

/** Server check for a new device. Resolves true when this user already accepted the current version. */
export async function acceptedOnServer(): Promise<boolean> {
  try {
    const uid = await currentUid();
    if (!uid) return false;
    const [{ doc, getDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('../lib/firebase/firestore')]);
    const snap = await getDoc(doc(db, 'users', uid));
    const ok = snap.exists() && snap.data()?.termsVersion === TERMS_VERSION;
    if (ok) markLocal(uid);
    return ok;
  } catch { return false; }
}

/** Record acceptance locally at once, then on the user's profile. */
export async function recordAcceptance(): Promise<void> {
  const local = savedUid();
  if (local) markLocal(local);
  try {
    const uid = await currentUid();
    if (!uid) return;
    markLocal(uid);
    const [{ doc, setDoc, serverTimestamp }, { db }] = await Promise.all([import('firebase/firestore'), import('../lib/firebase/firestore')]);
    await setDoc(doc(db, 'users', uid), { uid, termsVersion: TERMS_VERSION, termsAcceptedAt: serverTimestamp() }, { merge: true });
  } catch { /* cached locally; the profile write retries on the next acceptance check */ }
}
