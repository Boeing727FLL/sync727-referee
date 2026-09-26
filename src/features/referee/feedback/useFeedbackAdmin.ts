/**
 * useFeedbackAdmin - the feedback viewer's data and operations: owner
 * gate on every open, the live RTDB subscription plus manual refresh,
 * single delete and two-tap wipe-all (chunked), and the global popup
 * timer reset (server flag plus local device keys). Timers are tracked
 * so nothing fires into an unmounted tree.
 */
import { useState, useEffect, useRef } from 'react';
import { onValue, get, remove, ref, update } from 'firebase/database';
import { rtdb } from '../../../lib/firebase/rtdb';
import { useLanguage } from '../../../hooks/useLanguage';
import { feedbackQuery } from '../../../lib/analytics';
import { resetFeedbackForAll } from '../../../lib/refereeFlags';
import { isCurrentUserOwner } from '../../../lib/owner';
import { type FeedbackEntry } from './model';
import { chunkedNullUpdates, feedbackEntries } from '../data/snapshots';

/** Newest feedback entries kept live in the viewer. */
const FEEDBACK_LIMIT = 300;

/** RTDB multi-path delete chunk size. */
const BULK_CHUNK = 100;

/** How long the "timer reset" confirmation tick stays visible. */
const TIMER_CONFIRM_MS = 4000;

export default function useFeedbackAdmin(isOpen: boolean) {
  const { t } = useLanguage();
  // -- gate + data --------------------------------------------------------------
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // -- destructive confirmations (two-tap, never instant) -------------------------
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // -- toolbar busy flags -----------------------------------------------------------
  const [refreshing, setRefreshing] = useState(false);
  const [resettingTimer, setResettingTimer] = useState(false);
  const [timerReset, setTimerReset] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Pending UI timers are tracked and cancelled on unmount.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  /** Snapshot (live or manual) -> newest-first entries. */
  const applySnapshot = (value: unknown) => {
    setItems(feedbackEntries(value));
    setLoading(false);
  };

  /** One-shot server read (the live listener usually beats it to it). */
  const refreshFromServer = async () => {
    setRefreshing(true);
    try {
      const snap = await get(feedbackQuery(FEEDBACK_LIMIT));
      applySnapshot(snap.val());
    } catch (e) {
      console.warn("refresh feedback failed:", e);
    }
    setRefreshing(false);
  };

  // Fresh gate + wiped local state on every opening.
  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setItems([]);
      setConfirmDeleteId(null);
      setConfirmClearAll(false);
      setActionError(null);
      return;
    }
    setUnlocked(isCurrentUserOwner());
  }, [isOpen]);

  // Live subscription while an unlocked viewer is open.
  useEffect(() => {
    if (!isOpen || !unlocked) return;
    setLoading(true);
    const unsub = onValue(feedbackQuery(FEEDBACK_LIMIT), (snap) => {
      applySnapshot(snap.val());
    }, (err) => {
      console.warn("feedback snapshot failed:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [isOpen, unlocked]);

  /** Delete one entry (server rules enforce owner-only regardless). */
  const handleDelete = async (id: string) => {
    try {
      await remove(ref(rtdb, `referee/feedback/${id}`));
      setActionError(null);
    } catch (e) {
      console.warn("delete feedback failed:", e);
      // The entry stays visible, so say so instead of failing silently.
      setActionError(t('owner.deleteFailed'));
    }
    setConfirmDeleteId(null);
  };

  /** Two-tap wipe-all, chunked so one giant write never hits server limits. */
  const handleClearAll = async () => {
    try {
      for (const updates of chunkedNullUpdates('referee/feedback', items.map(item => item.id), BULK_CHUNK)) {
        await update(ref(rtdb), updates);
      }
      setActionError(null);
    } catch (e) {
      console.warn("clear all feedback failed:", e);
      setActionError(t('owner.deleteAllFailed'));
    }
    setConfirmClearAll(false);
  };

  /**
   * Reset the feedback popup timer GLOBALLY (server timestamp every client
   * obeys) plus local device keys, so the form pops again everywhere.
   */
  const resetPopupTimer = async () => {
    if (resettingTimer) return;
    setResettingTimer(true);
    try {
      await resetFeedbackForAll();
    } catch (e) {
      console.warn('global feedback reset failed:', e);
      setActionError(t('owner.resetFail'));
      setResettingTimer(false);
      return;
    }
    try {
      const prefixes = ['referee_feedback_last_prompt', 'referee_feedback_submitted_at'];
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && prefixes.some(p => k === p || k.startsWith(p + '_'))) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
    setResettingTimer(false);
    setActionError(null);
    setTimerReset(true);
    later(() => setTimerReset(false), TIMER_CONFIRM_MS);
  };


  return {
    unlocked, items, loading,
    confirmDeleteId, setConfirmDeleteId, confirmClearAll, setConfirmClearAll,
    refreshing, resetPopupTimer, resettingTimer, timerReset, actionError,
    refreshFromServer, handleDelete, handleClearAll,
  };
}
