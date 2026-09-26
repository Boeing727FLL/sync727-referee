/**
 * useRefereeJournal - the journal's data and operations: the head-referee
 * code gate, the live RTDB subscription (newest 200), the uid->name join
 * for the owner, single delete and two-tap bulk cleanup, plus the view
 * state the list reads (search, time filter, sort, expanded rows) and a
 * tracked-timer helper for transient UI. The modal keeps only rendering
 * and the copy feedback.
 */
import { useState, useEffect, useRef } from 'react';
import { onValue, remove, ref, set, serverTimestamp, update } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';
import { rtdb } from '../../../lib/firebase/rtdb';
import { auth } from '../../../lib/firebase/auth';
import { db } from '../../../lib/firebase/firestore';
import { logsQuery } from '../../../lib/analytics';
import { isCurrentUserOwner } from '../../../lib/owner';
import { toDate, type LogEntry, type TimeFilter, type UserNameMap } from './model';
import { chunkedNullUpdates, logEntries } from '../data/snapshots';

/** Server-checked access record: written when the code is entered, removed
 *  when the journal closes. The rules accept it only if the code matches the
 *  hidden secret, and honor it for 10 minutes at most. The code itself is
 *  never in the client. */
const accessRef = (uid: string) => ref(rtdb, `referee/journalAccess/${uid}`);

/** Newest entries kept live in the viewer. */
const LOG_LIMIT = 200;

/** How long error banners stay before auto-dismissing. */
const ERROR_BANNER_MS = 10000;

/** How long the bulk-clean second-tap confirmation stays armed. */
const CONFIRM_WINDOW_MS = 5000;

/** Bulk cleanup deletes entries older than this. */
const OLD_LOG_DAYS = 90;

/** Safety cap: one bulk cleanup never deletes more than this. */
const MAX_BULK_DELETE = 400;

/** RTDB multi-path delete chunk size. */
const BULK_CHUNK = 100;

const DAY_MS = 24 * 60 * 60 * 1000;


export default function useRefereeJournal(isOpen: boolean) {
  // -- gate state (head-referee code) -----------------------------------------
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);

  // -- live data ----------------------------------------------------------------
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [userNames, setUserNames] = useState<UserNameMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // -- view state (search, time filter, sort, expanded rows) ---------------------
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TimeFilter>('all');
  const [sortNew, setSortNew] = useState(true);

  // -- async operations (single delete, bulk clean) --------------------------------
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmOld, setConfirmOld] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  // Every pending timer (banner clears, copy tick, confirm window) is
  // tracked and cancelled on unmount, so nothing fires into a dead tree.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Deletes require a live owner Firebase session (server rule), so gate
  // the buttons explicitly instead of failing on the server. Reading is
  // allowed for any signed-in user with the code.
  const canDelete = isCurrentUserOwner();

  // Reset the whole viewer whenever it closes, so it always opens fresh.
  useEffect(() => {
    if (!isOpen) {
      const uid = auth.currentUser?.uid;
      if (uid) void remove(accessRef(uid)).catch(() => {});
      setCode('');
      setError(false);
      setUnlocked(false);
      setExpanded(new Set());
      setSearch('');
      setFilter('all');
      setSortNew(true);
      setConfirmOld(false);
      setDeleteError(null);
      return;
    }
  }, [isOpen]);

  // Live subscription (newest 200). RTDB returns ascending, reversed below.
  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    setLoadError(false);
    const unsub = onValue(
      logsQuery(LOG_LIMIT),
      (snap) => {
        setLogs(logEntries(snap.val()));
        setLoading(false);
      },
      (err: any) => {
        console.error('referee logs snapshot failed:', err);
        setLoadError(true);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [unlocked]);

  // Old journal records contain only a uid. The owner may list the existing
  // Firestore user profiles, so join uid -> name in memory without copying
  // emails or identifiers into the UI. A deleted/missing profile stays a
  // clean fallback; journal access itself is unchanged for non-owner viewers.
  useEffect(() => {
    if (!unlocked || !canDelete) return;
    let cancelled = false;
    getDocs(collection(db, 'users'))
      .then((snap) => {
        if (cancelled) return;
        const names: UserNameMap = {};
        snap.forEach((profile) => {
          const data = profile.data();
          const uid = String(data?.uid || profile.id || '').trim();
          const name = String(data?.name || '').trim();
          if (uid && name) names[uid] = name.slice(0, 120);
        });
        setUserNames(names);
      })
      .catch((err) => console.warn('historical journal names unavailable:', err));
    return () => { cancelled = true; };
  }, [unlocked, canDelete]);

  /** Code gate: exact match opens the journal, anything else shakes the box. */
  const [checking, setChecking] = useState(false);
  const handleUnlock = async () => {
    const uid = auth.currentUser?.uid;
    const entered = code.trim();
    if (!uid || !entered || checking) { setError(true); return; }
    setChecking(true);
    try {
      await set(accessRef(uid), { code: entered, at: serverTimestamp() });
      setUnlocked(true);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };
  // Leaving the page with the journal open also drops the access record.
  useEffect(() => {
    if (!unlocked) return;
    const drop = () => { const uid = auth.currentUser?.uid; if (uid) void remove(accessRef(uid)).catch(() => {}); };
    window.addEventListener('pagehide', drop);
    return () => { window.removeEventListener('pagehide', drop); drop(); };
  }, [unlocked]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Delete one entry (owner only). Failures surface with their server code. */
  const handleDelete = async (id: string) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await remove(ref(rtdb, `referee/logs/${id}`));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      console.error('referee log delete failed:', err);
      setDeleteError('המחיקה נכשלה. בדוק חיבור לאינטרנט וודא שאתה מחובר עם חשבון הבעלים, ונסה שוב.');
      later(() => setDeleteError(null), ERROR_BANNER_MS);
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Two-tap bulk cleanup of entries older than OLD_LOG_DAYS, chunked
   * multi-path deletes so one giant write never hits server limits.
   */
  const cleanOldLogs = async () => {
    if (!confirmOld) {
      setConfirmOld(true);
      // The armed second tap expires like every other two-tap confirm,
      // instead of staying armed indefinitely.
      later(() => setConfirmOld(false), CONFIRM_WINDOW_MS);
      return;
    }
    setCleaning(true);
    try {
      const cutoff = Date.now() - OLD_LOG_DAYS * DAY_MS;
      const ids: string[] = [];
      for (const l of logs) {
        const d = toDate(l.createdAt);
        if (d && d.getTime() < cutoff && ids.length < MAX_BULK_DELETE) ids.push(l.id);
      }
      for (const updates of chunkedNullUpdates('referee/logs', ids, BULK_CHUNK)) {
        await update(ref(rtdb), updates);
      }
    } catch (err: any) {
      console.error('referee log bulk clean failed:', err);
      setDeleteError('ניקוי הרשומות הישנות נכשל. ודא חיבור כבעלים ונסה שוב.');
      later(() => setDeleteError(null), ERROR_BANNER_MS);
      return;
    } finally {
      setCleaning(false);
      setConfirmOld(false);
    }
  };


  return {
    code, setCode, error, setError, checking, unlocked, handleUnlock,
    logs, loading, loadError, userNames, canDelete,
    expanded, toggleExpand, search, setSearch, filter, setFilter, sortNew, setSortNew,
    deletingId, deleteError, handleDelete,
    confirmOld, cleaning, cleanOldLogs,
    later,
  };
}
