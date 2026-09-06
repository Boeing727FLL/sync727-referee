/**
 * Analytics + presence + remote flags for the Virtual Referee app.
 *
 * WHAT: every number and list the owner sees (questions asked, registered
 * users, online users, Q&A journal, feedback, maintenance mode) lives here.
 *
 * WHERE: all analytics data lives in Firebase Realtime Database under the
 * `referee/` tree (fast live listeners, atomic counters, on-disconnect
 * cleanup). The only Firestore touch left is counting legacy signup docs
 * in the shared team-app `users` collection, which is user data, not
 * analytics, and therefore stays where it is.
 *
 * FAILURE POLICY: analytics must never break the app. Every write is
 * wrapped so a network or permission failure degrades to a console
 * warning, never to a user-facing error.
 */

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
import {
  collection,
  getDocs as fsGetDocs,
  onSnapshot as fsOnSnapshot,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Paths & tuning constants
// ---------------------------------------------------------------------------

const STATS_PATH = 'referee/stats';
const LOGS_PATH = 'referee/logs';
const FEEDBACK_PATH = 'referee/feedback';
const PRESENCE_PATH = 'referee/presence';
const SESSIONS_PATH = 'referee/sessions';
const META_PATH = 'referee/meta';

/** How often a tab re-announces "I'm still here" (presence heartbeat). */
const PRESENCE_HEARTBEAT_MS = 30_000;

/** Presence entries older than this are treated as stale ghosts. */
const ONLINE_CUTOFF_MS = 120_000;

/**
 * Doc IDs starting with these prefixes belong to the main team app's own
 * login (passcode users), not to referee-app signups. They must never
 * inflate the referee "registered users" count.
 */
const TEAM_APP_ID_PREFIX = /^(member|parent|mentor|admin)_/;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type AnalyticsStats = {
  totalQuestions: number;
  registeredUsers: number;
  activeUsers: number;
  avgPerUser: number;
};

type QuestionLog = {
  question: string;
  answer: string;
  season?: string;
  language?: string;
  uid?: string | null;
  model?: string;
  ok?: boolean;
};

type FeedbackLog = {
  rating: number;
  improvements?: string;
  uid?: string | null;
  season?: string;
  language?: string;
};

type PresenceEntry = {
  uid: string;
  deviceId?: string;
  onlineAt?: number;
};

// ---------------------------------------------------------------------------
// Small internal helpers
// ---------------------------------------------------------------------------

const statsRef = () => ref(rtdb, STATS_PATH);
const logsRef = () => ref(rtdb, LOGS_PATH);
const feedbackRef = () => ref(rtdb, FEEDBACK_PATH);
const presenceRef = () => ref(rtdb, PRESENCE_PATH);
const sessionsRef = () => ref(rtdb, SESSIONS_PATH);
const sessionRef = (uid: string) => child(sessionsRef(), uid);

/**
 * Run an analytics write without ever throwing: failures become warnings.
 * Analytics is observability, not functionality, so it must stay silent.
 */
async function guard(label: string, fn: () => PromiseLike<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`${label} failed:`, e);
  }
}

/** True for team-app passcode IDs, which are not referee signups. */
function isTeamAppId(id: string): boolean {
  return TEAM_APP_ID_PREFIX.test(id);
}

/**
 * Derive the dashboard numbers from a raw stats object. Shared by the
 * one-shot fetch and the live subscription so both always agree.
 */
function deriveStats(raw: any, registeredUsers: number): AnalyticsStats {
  const totalQuestions = Number(raw.totalQuestions) || 0;
  const perUser = raw.perUser || {};
  const activeUsers = Object.keys(perUser).length;
  const avgPerUser = activeUsers > 0 ? totalQuestions / activeUsers : 0;
  return { totalQuestions, registeredUsers, activeUsers, avgPerUser };
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * Count one answered question, globally and per user.
 * Uses server-side atomic increments: no read is needed, so concurrent
 * questions from many devices can never overwrite each other, and the
 * call stays permitted under owner-only stats reads.
 */
export async function trackQuestion(uid: string): Promise<void> {
  await guard('trackQuestion', () =>
    update(statsRef(), {
      totalQuestions: increment(1),
      [`perUser/${uid}`]: increment(1),
    }),
  );
}

/**
 * Remember that this uid opened the referee app (stores last-seen time).
 * The referee app has its own login, separate from the team app, so its
 * users are tracked here rather than in the shared `users` collection.
 */
export async function trackRefereeUser(uid: string): Promise<void> {
  await guard('trackRefereeUser', () =>
    update(statsRef(), {
      [`refereeUsers/${uid}`]: rtdbTimestamp(),
    }),
  );
}

/** Forget a user from every counter map (used when an account is deleted). */
export async function removeRefereeUser(uid: string): Promise<void> {
  await guard('removeRefereeUser', () =>
    update(statsRef(), {
      [`refereeUsers/${uid}`]: null,
      [`perUser/${uid}`]: null,
    }),
  );
}

/** Zero the question counters (owner action, two-tap confirmed in the UI). */
export async function resetQuestions(): Promise<void> {
  await guard('resetQuestions', async () => {
    // NOTE: writing `{}` would be a no-op merge in RTDB, so the map is
    // removed outright instead of overwritten with an empty object.
    await remove(child(statsRef(), 'perUser'));
    await set(child(statsRef(), 'totalQuestions'), 0);
  });
}

// ---------------------------------------------------------------------------
// Journal (Q&A log) and feedback log
// ---------------------------------------------------------------------------

/** Append one answered question for head-referee review in the journal. */
export async function logRefereeQA(payload: QuestionLog): Promise<void> {
  await guard('logRefereeQA', () =>
    push(logsRef(), {
      question: payload.question,
      answer: payload.answer || '',
      season: payload.season || '',
      language: payload.language || '',
      uid: payload.uid || 'anon',
      model: payload.model || '',
      // Absent means success; only an explicit false marks a failure.
      ok: payload.ok !== false,
      createdAt: rtdbTimestamp(),
    }),
  );
}

/** Save one user rating for head-referee review in the feedback viewer. */
export async function logRefereeFeedback(payload: FeedbackLog): Promise<void> {
  await guard('logRefereeFeedback', () => {
    const entry: Record<string, unknown> = {
      rating: payload.rating,
      uid: payload.uid || 'anon',
      season: payload.season || '',
      language: payload.language || '',
      createdAt: rtdbTimestamp(),
    };
    // RTDB rejects undefined values outright, so the optional field is only
    // added when it actually holds text.
    if (typeof payload.improvements === 'string' && payload.improvements.trim()) {
      entry.improvements = payload.improvements;
    }
    return push(feedbackRef(), entry);
  });
}

/** Newest-first queries shared by the journal and feedback viewers. */
export function logsQuery(limit = 200) {
  return rtdbQuery(logsRef(), orderByChild('createdAt'), limitToLast(limit));
}

export function feedbackQuery(limit = 300) {
  return rtdbQuery(feedbackRef(), orderByChild('createdAt'), limitToLast(limit));
}

// ---------------------------------------------------------------------------
// Presence ("who is online") and single-session lock
// ---------------------------------------------------------------------------

/** Stable per-device identifier, created once and kept in localStorage. */
export function getDeviceId(): string {
  let id = localStorage.getItem('referee_device_id');
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('referee_device_id', id);
  }
  return id;
}

/**
 * Announce this tab as online. Returns a cleanup that stops the heartbeat
 * and removes the entry. The server ALSO removes the entry automatically on
 * disconnect, so crashed tabs and killed browsers leave no ghosts behind.
 */
export function startPresence(uid: string, deviceId?: string): () => void {
  const devId = deviceId || getDeviceId();
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entryRef = child(presenceRef(), sessionId);
  const touch = () =>
    set(entryRef, {
      uid,
      deviceId: devId,
      onlineAt: rtdbTimestamp(),
    }).catch((e) => console.warn('startPresence failed:', e));
  touch();
  onDisconnect(entryRef).remove().catch(() => {});
  const heartbeat = setInterval(touch, PRESENCE_HEARTBEAT_MS);
  return () => {
    clearInterval(heartbeat);
    remove(entryRef).catch(() => {});
  };
}

/**
 * Live online-user count. A user counts only when their presence entry comes
 * from the device that currently owns their session (see registerSession),
 * which filters out stale tabs, other devices, and anonymous entries.
 */
export function onOnlineUsersChange(callback: (count: number) => void): () => void {
  let presence: PresenceEntry[] = [];
  let activeByUid: Record<string, string> = {};

  const pushCount = () => {
    const cutoff = Date.now() - ONLINE_CUTOFF_MS;
    const counted = new Set<string>();
    for (const p of presence) {
      if (!p.uid) continue;
      if (p.onlineAt && p.onlineAt < cutoff) continue;
      const active = activeByUid[p.uid];
      if (active && p.deviceId === active) counted.add(p.uid);
    }
    callback(counted.size);
  };

  const unsubPresence = onValue(
    presenceRef(),
    (snap: DataSnapshot) => {
      const val = snap.val() || {};
      presence = Object.values(val) as PresenceEntry[];
      pushCount();
    },
    (err) => console.warn('presence snapshot failed:', err),
  );

  const unsubSessions = onValue(
    sessionsRef(),
    (snap: DataSnapshot) => {
      const val = snap.val() || {};
      activeByUid = {};
      for (const [uid, data] of Object.entries(val) as [string, any][]) {
        if (data?.deviceId) activeByUid[uid] = data.deviceId;
      }
      pushCount();
    },
    (err) => console.warn('sessions snapshot failed:', err),
  );

  return () => {
    unsubPresence();
    unsubSessions();
  };
}

/** Claim the single active session for this device (called on login). */
export async function registerSession(uid: string, deviceId: string): Promise<void> {
  await guard('registerSession', () =>
    set(sessionRef(uid), {
      deviceId,
      claimedAt: rtdbTimestamp(),
    }),
  );
}

/**
 * Watch for another device claiming the same user. Calls onKicked exactly
 * once, then goes silent.
 */
export function watchSession(uid: string, myDeviceId: string, onKicked: () => void): () => void {
  let kicked = false;
  return onValue(
    sessionRef(uid),
    (snap: DataSnapshot) => {
      if (kicked) return;
      const data = snap.val();
      if (!data || !data.deviceId) return;
      if (data.deviceId !== myDeviceId) {
        kicked = true;
        onKicked();
      }
    },
    (err) => console.warn('session watch failed:', err),
  );
}

// ---------------------------------------------------------------------------
// Dashboard reads (one-shot + live)
// ---------------------------------------------------------------------------

/**
 * Count referee-app signups: every users doc EXCEPT team-app passcode IDs.
 * Signup docs are the definition of "registered" — the last-seen tracking
 * map is deliberately excluded because it also holds test and social
 * logins with no signup doc, which once inflated this number with ghosts.
 */
async function countRegisteredUsers(): Promise<number> {
  try {
    const usersSnap = await fsGetDocs(collection(db, 'users'));
    let n = 0;
    for (const d of usersSnap.docs) {
      if (!isTeamAppId(d.id)) n++;
    }
    return n;
  } catch (e) {
    console.warn('registered users count failed:', e);
    return 0;
  }
}

/** One-shot dashboard snapshot. */
export async function getAnalytics(): Promise<AnalyticsStats> {
  const snap = await get(statsRef());
  const stats = snap.exists() ? (snap.val() as any) : {};
  return deriveStats(stats, await countRegisteredUsers());
}

/** Live dashboard: re-emits whenever counters or the user list change. */
export function subscribeAnalytics(callback: (stats: AnalyticsStats) => void): () => void {
  let lastStats: any = null;
  let registered = 0;

  const pushStats = () => {
    if (!lastStats) return;
    callback(deriveStats(lastStats, registered));
  };

  const unsubStats = onValue(
    statsRef(),
    (snap: DataSnapshot) => {
      lastStats = snap.val() || {};
      pushStats();
    },
    (err) => console.warn('analytics stats snapshot failed:', err),
  );

  const unsubUsers = fsOnSnapshot(
    collection(db, 'users'),
    (snap) => {
      registered = 0;
      snap.docs.forEach((d) => {
        if (!isTeamAppId(d.id)) registered++;
      });
      pushStats();
    },
    (err) => console.warn('analytics users snapshot failed:', err),
  );

  return () => {
    unsubStats();
    unsubUsers();
  };
}

// ---------------------------------------------------------------------------
// Owner remote flags (global feedback reset + maintenance mode)
// ---------------------------------------------------------------------------

/**
 * Wipe feedback-popup suppression for EVERYONE (all users, all devices).
 * Clients ignore their local timers older than this server timestamp, so
 * the next answered question prompts feedback again everywhere.
 */
export async function resetFeedbackForAll(): Promise<void> {
  await guard('resetFeedbackForAll', () =>
    set(ref(rtdb, `${META_PATH}/feedbackResetAt`), rtdbTimestamp()),
  );
}

export function subscribeFeedbackReset(callback: (resetAtMs: number) => void): () => void {
  return onValue(
    ref(rtdb, `${META_PATH}/feedbackResetAt`),
    (snap: DataSnapshot) => {
      const v = snap.val();
      callback(typeof v === 'number' ? v : 0);
    },
    (err) => console.warn('feedback reset snapshot failed:', err),
  );
}

/** Freeze the app for everyone except the owner (work mode switch). */
export async function setMaintenance(on: boolean): Promise<void> {
  await guard('setMaintenance', () => set(ref(rtdb, `${META_PATH}/maintenance`), on));
}

export function subscribeMaintenance(callback: (on: boolean) => void): () => void {
  return onValue(
    ref(rtdb, `${META_PATH}/maintenance`),
    (snap: DataSnapshot) => {
      callback(snap.val() === true);
    },
    (err) => console.warn('maintenance snapshot failed:', err),
  );
}
