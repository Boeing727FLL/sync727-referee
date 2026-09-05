import {
  ref,
  child,
  get,
  set,
  update,
  remove,
  push,
  query as rtdbQuery,
  orderByChild,
  limitToLast,
  onValue,
  increment,
  serverTimestamp as rtdbTimestamp,
  onDisconnect,
  type DataSnapshot,
} from 'firebase/database';
import { rtdb, db } from './firebase';
// Firestore is kept only for counting legacy user docs (shared team-app
// collection, not analytics data). All analytics data lives in RTDB.
import {
  collection,
  getDocs as fsGetDocs,
  onSnapshot as fsOnSnapshot,
} from 'firebase/firestore';

const STATS_PATH = 'referee/stats';
const LOGS_PATH = 'referee/logs';
const FEEDBACK_PATH = 'referee/feedback';
const PRESENCE_PATH = 'referee/presence';
const SESSIONS_PATH = 'referee/sessions';

const statsRef = () => ref(rtdb, STATS_PATH);
const logsRef = () => ref(rtdb, LOGS_PATH);
const feedbackRef = () => ref(rtdb, FEEDBACK_PATH);
const presenceRef = () => ref(rtdb, PRESENCE_PATH);
const sessionsRef = () => ref(rtdb, SESSIONS_PATH);

export async function trackQuestion(uid: string) {
  try {
    // Server-side atomic increments: no read needed, safe under owner-only reads.
    await update(statsRef(), {
      totalQuestions: increment(1),
      [`perUser/${uid}`]: increment(1),
    });
  } catch (e) {
    console.warn("trackQuestion failed:", e);
  }
}

// The virtual referee (השופט) has its OWN login - track its users separately,
// NOT the shared `users` collection of the main team app.
export async function trackRefereeUser(uid: string) {
  try {
    await update(statsRef(), {
      [`refereeUsers/${uid}`]: rtdbTimestamp(),
    });
  } catch (e) {
    console.warn("trackRefereeUser failed:", e);
  }
}

// Log every question + answer pair so the head referees can review them
// from the hidden logs screen (tools menu, code "fLl").
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
    await push(logsRef(), {
      question: payload.question,
      answer: payload.answer || '',
      season: payload.season || '',
      language: payload.language || '',
      uid: payload.uid || 'anon',
      model: payload.model || '',
      ok: payload.ok !== false,
      createdAt: rtdbTimestamp(),
    });
  } catch (e) {
    console.warn("logRefereeQA failed:", e);
  }
}

// Save user feedback on the virtual referee so the head referees can review it
// from the feedback viewer (opened from the analytics panel).
export async function logRefereeFeedback(payload: {
  rating: number;
  improvements?: string;
  uid?: string | null;
  season?: string;
  language?: string;
}) {
  try {
    const entry: Record<string, any> = {
      rating: payload.rating,
      uid: payload.uid || 'anon',
      season: payload.season || '',
      language: payload.language || '',
      createdAt: rtdbTimestamp(),
    };
    // RTDB rejects undefined values, so only include improvements when set.
    if (typeof payload.improvements === 'string' && payload.improvements.trim()) {
      entry.improvements = payload.improvements;
    }
    await push(feedbackRef(), entry);
  } catch (e) {
    console.warn("logRefereeFeedback failed:", e);
  }
}

export function startPresence(uid: string, deviceId?: string): () => void {
  const devId = deviceId || getDeviceId();
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pRef = child(presenceRef(), sessionId);
  const touch = () => set(pRef, {
    uid,
    deviceId: devId,
    onlineAt: rtdbTimestamp()
  }).catch((e) => console.warn("startPresence failed:", e));
  touch();
  // RTDB superpower: the server removes our presence automatically when we
  // disconnect, so no stale docs linger after crashes or closed tabs.
  onDisconnect(pRef).remove().catch(() => {});
  const heartbeat = setInterval(touch, 30000);
  return () => {
    clearInterval(heartbeat);
    remove(pRef).catch(() => {});
  };
}

// A user counts as online only when their presence doc comes from the device
// that currently owns the active session for that user (see registerSession).
// This filters out stale/leftover docs from old tabs, other devices and 'anon'.
export function onOnlineUsersChange(callback: (count: number) => void): () => void {
  let presence: { uid: string; deviceId?: string; onlineAt?: number }[] = [];
  let activeByUid: Record<string, string> = {};

  const pushCount = () => {
    const cutoff = Date.now() - 120000;
    const counted = new Set<string>();
    for (const p of presence) {
      if (!p.uid) continue;
      if (p.onlineAt && p.onlineAt < cutoff) continue;
      const active = activeByUid[p.uid];
      if (active && p.deviceId === active) counted.add(p.uid);
    }
    callback(counted.size);
  };

  const unsubPresence = onValue(presenceRef(), (snap: DataSnapshot) => {
    const val = snap.val() || {};
    presence = Object.values(val) as { uid: string; deviceId?: string; onlineAt?: number }[];
    pushCount();
  }, (err) => console.warn("presence snapshot failed:", err));

  const unsubSessions = onValue(sessionsRef(), (snap: DataSnapshot) => {
    const val = snap.val() || {};
    activeByUid = {};
    for (const [uid, data] of Object.entries(val) as [string, any][]) {
      if (data?.deviceId) activeByUid[uid] = data.deviceId;
    }
    pushCount();
  }, (err) => console.warn("sessions snapshot failed:", err));

  return () => { unsubPresence(); unsubSessions(); };
}

export async function getAnalytics(): Promise<{
  totalQuestions: number;
  registeredUsers: number;
  activeUsers: number;
  avgPerUser: number;
}> {
  const snap = await get(statsRef());
  const stats = snap.exists() ? (snap.val() as any) : {};
  const totalQuestions = Number(stats.totalQuestions) || 0;
  const perUser = stats.perUser || {};
  const activeUsers = Object.keys(perUser).length;

  // Count the virtual referee's OWN users (its own login), not the main team app's users.
  const refereeUserIds = new Set<string>(Object.keys(stats.refereeUsers || {}));
  try {
    const usersSnap = await fsGetDocs(collection(db, 'users'));
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

export async function removeRefereeUser(uid: string) {
  try {
    await update(statsRef(), {
      [`refereeUsers/${uid}`]: null,
      [`perUser/${uid}`]: null,
    });
  } catch (e) {
    console.warn("removeRefereeUser failed:", e);
  }
}

export async function resetQuestions() {
  try {
    await remove(child(statsRef(), 'perUser'));
    await set(child(statsRef(), 'totalQuestions'), 0);
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

// Real-time analytics via RTDB listeners (no polling).
export function subscribeAnalytics(callback: (stats: AnalyticsStats) => void): () => void {
  let lastStats: any = null;
  let lastRefereeIds = new Set<string>();

  const pushStats = () => {
    if (!lastStats) return;
    const totalQuestions = Number(lastStats.totalQuestions) || 0;
    const perUser = lastStats.perUser || {};
    const activeUsers = Object.keys(perUser).length;
    const avgPerUser = activeUsers > 0 ? totalQuestions / activeUsers : 0;
    callback({ totalQuestions, registeredUsers: lastRefereeIds.size, activeUsers, avgPerUser });
  };

  const unsubStats = onValue(statsRef(), (snap: DataSnapshot) => {
    lastStats = snap.val() || {};
    pushStats();
  }, (err) => console.warn("analytics stats snapshot failed:", err));

  // Legacy user docs live in the shared Firestore `users` collection.
  const unsubUsers = fsOnSnapshot(collection(db, 'users'), (snap) => {
    const ids = new Set<string>(Object.keys(lastStats?.refereeUsers || {}));
    snap.docs.forEach(d => {
      const id = d.id;
      if (/^(member|parent|mentor|admin)_/.test(id)) return;
      ids.add(id);
    });
    lastRefereeIds = ids;
    pushStats();
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

const sessionRef = (uid: string) => child(sessionsRef(), uid);

// Claim the session for this device. Called on login.
export async function registerSession(uid: string, deviceId: string) {
  try {
    await set(sessionRef(uid), {
      deviceId,
      claimedAt: rtdbTimestamp()
    });
  } catch (e) {
    console.warn("registerSession failed:", e);
  }
}

// Listen for another device claiming the same user. Calls onKicked exactly once.
export function watchSession(uid: string, myDeviceId: string, onKicked: () => void): () => void {
  let kicked = false;
  return onValue(sessionRef(uid), (snap: DataSnapshot) => {
    if (kicked) return;
    const data = snap.val();
    if (!data || !data.deviceId) return;
    if (data.deviceId !== myDeviceId) {
      kicked = true;
      onKicked();
    }
  }, (err) => console.warn("session watch failed:", err));
}

// Realtime ordered queries shared by the journal and feedback viewers.
export function logsQuery(limit = 200) {
  return rtdbQuery(logsRef(), orderByChild('createdAt'), limitToLast(limit));
}

export function feedbackQuery(limit = 300) {
  return rtdbQuery(feedbackRef(), orderByChild('createdAt'), limitToLast(limit));
}
