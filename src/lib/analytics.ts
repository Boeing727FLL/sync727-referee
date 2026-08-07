import { doc, setDoc, increment, getDocsFromServer, getDocFromServer, collection, deleteDoc, deleteField, serverTimestamp, onSnapshot, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from './firebase';

const STATS_REF = doc(db, 'analytics', 'stats');

export async function trackQuestion(uid: string) {
  try {
    await setDoc(STATS_REF, {
      totalQuestions: increment(1),
      perUser: {
        [uid]: increment(1)
      }
    }, { merge: true });
  } catch (e) {
    console.warn("trackQuestion failed:", e);
  }
}

// The virtual referee (השופט) has its OWN login - track its users separately,
// NOT the shared `users` collection of the main team app.
export async function trackRefereeUser(uid: string) {
  try {
    await setDoc(STATS_REF, {
      refereeUsers: {
        [uid]: Date.now()
      }
    }, { merge: true });
  } catch (e) {
    console.warn("trackRefereeUser failed:", e);
  }
}

// Log every question + answer pair so the head referees can review them
// from the hidden logs screen (5 quick taps on "Developed By", code "FLL").
export async function logRefereeQA(payload: {
  question: string;
  answer: string;
  season?: string;
  language?: string;
  uid?: string | null;
  model?: string;
  ok?: boolean;
}) {
  try {
    await addDoc(collection(db, 'referee_logs'), {
      ...payload,
      uid: payload.uid || 'anon',
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("logRefereeQA failed:", e);
  }
}

// Save user feedback on the virtual referee so the head referees can review it
// from the hidden feedback page (opened via a link in the analytics panel).
export async function logRefereeFeedback(payload: {
  rating: number;
  comment?: string;
  uid?: string | null;
  season?: string;
  language?: string;
}) {
  try {
    await addDoc(collection(db, 'referee_feedback'), {
      ...payload,
      uid: payload.uid || 'anon',
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("logRefereeFeedback failed:", e);
  }
}

export function startPresence(uid: string, deviceId?: string): () => void {
  const devId = deviceId || getDeviceId();
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const presenceRef = doc(db, 'presence', sessionId);
  const touch = () => setDoc(presenceRef, {
    uid,
    deviceId: devId,
    onlineAt: serverTimestamp()
  }, { merge: true }).catch((e) => console.warn("startPresence failed:", e));
  touch();
  const heartbeat = setInterval(touch, 30000);
  return () => {
    clearInterval(heartbeat);
    deleteDoc(presenceRef).catch(() => {});
  };
}

// A user counts as online only when their presence doc comes from the device
// that currently owns the active session for that user (see registerSession).
// This filters out stale/leftover docs from old tabs, other devices and 'anon'.
export function onOnlineUsersChange(callback: (count: number) => void): () => void {
  const freshPresence: { uid: string; deviceId?: string }[] = [];
  const activeByUid: Record<string, string> = {};

  const push = () => {
    const counted = new Set<string>();
    for (const p of freshPresence) {
      const active = activeByUid[p.uid];
      if (active && p.deviceId === active) counted.add(p.uid);
    }
    callback(counted.size);
  };

  const unsubPresence = onSnapshot(collection(db, 'presence'), (snap) => {
    const now = Timestamp.now();
    const cutoff = new Timestamp(now.seconds - 120, now.nanoseconds);
    freshPresence.length = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      const uid = data?.uid;
      if (!uid) return;
      // Ignore stale docs left behind by tabs/sessions that closed uncleanly
      if (!data.onlineAt || data.onlineAt.seconds < cutoff.seconds) return;
      freshPresence.push({ uid, deviceId: data.deviceId });
    });
    push();
  }, (err) => console.warn("presence snapshot failed:", err));

  const unsubSessions = onSnapshot(collection(db, 'sessions'), (snap) => {
    for (const k of Object.keys(activeByUid)) delete activeByUid[k];
    snap.docs.forEach(d => {
      const data = d.data();
      if (data?.deviceId) activeByUid[d.id] = data.deviceId;
    });
    push();
  }, (err) => console.warn("sessions snapshot failed:", err));

  return () => { unsubPresence(); unsubSessions(); };
}

export async function getAnalytics(): Promise<{
  totalQuestions: number;
  registeredUsers: number;
  activeUsers: number;
  avgPerUser: number;
}> {
  const statsSnap = await getDocFromServer(STATS_REF);
  const stats = statsSnap.exists() ? statsSnap.data() : {};
  const totalQuestions = stats.totalQuestions || 0;
  const perUser = stats.perUser || {};
  const activeUsers = Object.keys(perUser).length;

  // Clean up any legacy dotted fields (e.g. "refereeUsers.abc") that were
  // written before we switched to a properly nested map.
  try {
    const legacy = Object.keys(stats).filter(k => k.startsWith('refereeUsers.'));
    if (legacy.length > 0) {
      const deletes: Record<string, any> = {};
      legacy.forEach(k => { deletes[k] = deleteField(); });
      await updateDoc(STATS_REF, deletes);
    }
  } catch (e) {
    console.warn("legacy cleanup failed:", e);
  }

  // Count the virtual referee's OWN users (its own login), not the main team app's users.
  const refereeUserIds = new Set<string>(Object.keys(stats.refereeUsers || {}));
  try {
    const usersSnap = await getDocsFromServer(collection(db, 'users'));
    for (const d of usersSnap.docs) {
      const id = d.id;
      if (/^(member|parent|mentor|admin)_/.test(id)) continue;
      refereeUserIds.add(id);
    }
  } catch (e) {
    console.warn("registered users count failed:", e);
  }
  const registeredUsers = refereeUserIds.size;

  const avgPerUser = activeUsers > 0 ? totalQuestions / activeUsers : 0;
  return { totalQuestions, registeredUsers, activeUsers, avgPerUser };
}

export async function resetQuestions() {
  try {
    await setDoc(STATS_REF, { totalQuestions: 0, perUser: {} }, { merge: true });
  } catch (e) {
    console.warn("resetQuestions failed:", e);
  }
}

export type AnalyticsStats = {
  totalQuestions: number;
  registeredUsers: number;
  activeUsers: number;
  avgPerUser: number;
};

// Real-time analytics via Firestore listeners (no polling).
export function subscribeAnalytics(callback: (stats: AnalyticsStats) => void): () => void {
  let lastStats: any = null;
  let lastRefereeIds = new Set<string>();

  const push = () => {
    if (!lastStats) return;
    const totalQuestions = lastStats.totalQuestions || 0;
    const perUser = lastStats.perUser || {};
    const activeUsers = Object.keys(perUser).length;
    const avgPerUser = activeUsers > 0 ? totalQuestions / activeUsers : 0;
    callback({ totalQuestions, registeredUsers: lastRefereeIds.size, activeUsers, avgPerUser });
  };

  const unsubStats = onSnapshot(STATS_REF, (snap) => {
    lastStats = snap.data() || {};
    push();
  }, (err) => console.warn("analytics stats snapshot failed:", err));

  const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
    const ids = new Set<string>(Object.keys(lastStats?.refereeUsers || {}));
    snap.docs.forEach(d => {
      const id = d.id;
      if (/^(member|parent|mentor|admin)_/.test(id)) return;
      ids.add(id);
    });
    lastRefereeIds = ids;
    push();
  }, (err) => console.warn("analytics users snapshot failed:", err));

  return () => { unsubStats(); unsubUsers(); };
}

// ===== Single-session lock (kick old device when same user logs in elsewhere) =====

// Stable per-device identifier stored in localStorage.
export function getDeviceId(): string {
  let id = localStorage.getItem('referee_device_id');
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('referee_device_id', id);
  }
  return id;
}

const SESSION_REF = (uid: string) => doc(db, 'sessions', uid);

// Claim the session for this device. Called on login.
export async function registerSession(uid: string, deviceId: string) {
  try {
    await setDoc(SESSION_REF(uid), {
      deviceId,
      claimedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn("registerSession failed:", e);
  }
}

// Listen for another device claiming the same user. Calls onKicked exactly once.
export function watchSession(uid: string, myDeviceId: string, onKicked: () => void): () => void {
  let kicked = false;
  return onSnapshot(SESSION_REF(uid), (snap) => {
    if (kicked) return;
    const data = snap.data();
    if (!data || !data.deviceId) return;
    if (data.deviceId !== myDeviceId) {
      kicked = true;
      onKicked();
    }
  }, (err) => console.warn("session watch failed:", err));
}