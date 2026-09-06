/**
 * FeedbackAdminModal — owner-only floating viewer for user feedback.
 *
 * WHAT: live star ratings + improvement notes from the RTDB `referee/feedback`
 * tree, with per-item delete, wipe-all, manual refresh, and the global
 * feedback-popup timer reset. Opens from the analytics panel; never a page,
 * so the chat underneath stays alive.
 *
 * ACCESS: the whole viewer gates on the owner account. Everyone else sees
 * the lock screen. Deletes are additionally enforced by the server rules.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Star, MessageSquareHeart, RefreshCw, Trash2, Inbox, Check } from 'lucide-react';
import { onValue, get, remove, ref, update } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { feedbackQuery, resetFeedbackForAll } from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';

// ---------------------------------------------------------------------------
// Configuration constants (no magic numbers in logic or JSX below)
// ---------------------------------------------------------------------------

/** Newest feedback entries kept live in the viewer. */
const FEEDBACK_LIMIT = 300;

/** RTDB multi-path delete chunk size. */
const BULK_CHUNK = 100;

/** How long the "timer reset" confirmation stays visible. */
const TIMER_CONFIRM_MS = 4000;

/** Ratings at/above this count as praise, at/below that as complaints. */
const HIGH_RATING = 4;
const LOW_RATING = 2;

/** Entrance stagger for list rows (capped so long lists settle fast). */
const STAGGER_STEP = 0.03;
const STAGGER_MAX = 0.3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** One feedback entry as stored under RTDB `referee/feedback`. */
type FeedbackEntry = {
  id: string;
  rating?: number;
  improvements?: string;
  uid?: string;
  season?: string;
  language?: string;
  createdAt?: any;
};

// ---------------------------------------------------------------------------
// Timestamp helpers (RTDB stores plain millis; legacy shapes still parse)
// ---------------------------------------------------------------------------

/** Normalize any stored timestamp shape to millis-since-epoch. */
function toMs(ts: any): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts < 1e11 ? ts * 1000 : ts;
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

/** Full Hebrew timestamp for entry footers (empty string when unknown). */
function formatTime(ts: any): string {
  const ms = toMs(ts);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('he-IL');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Presentational pieces (no hooks, no logic — pure props in, JSX out)
// ---------------------------------------------------------------------------

/** One of the three top stat tiles (count / average / praise). */
function StatTile({ value, label, glow }: { value: string; label: string; glow: 'white' | 'gold' | 'green' }) {
  const palette = glow === 'gold'
    ? 'from-yellow-400/[0.10] to-transparent text-yellow-300 border-yellow-400/25 shadow-[0_0_24px_rgba(250,204,21,0.10)]'
    : glow === 'green'
      ? 'from-emerald-400/[0.10] to-transparent text-emerald-300 border-emerald-400/25 shadow-[0_0_24px_rgba(52,211,153,0.10)]'
      : 'from-white/[0.06] to-transparent text-white border-white/10';
  return (
    <div className={`bg-gradient-to-b border rounded-2xl p-4 text-center ${palette}`}>
      <div className="text-2xl md:text-3xl font-black tabular-nums">{value}</div>
      <div className="text-[11px] text-slate-400 font-semibold mt-1">{label}</div>
    </div>
  );
}

/** Small dark-glass toolbar button (refresh, reset timer, cancel...). */
function GhostButton({ onClick, disabled, title, children }: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
    >
      {children}
    </button>
  );
}

/** Solid red confirmation button (delete / wipe-all second tap). */
function DangerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-b from-red-400 to-red-600 text-white text-xs font-black hover:from-red-300 hover:to-red-500 transition-all shadow-[0_4px_14px_rgba(239,68,68,0.35)] cursor-pointer"
    >
      {children}
    </button>
  );
}

/** Five-star row; filled stars follow the rating. */
function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr" aria-label={`דירוג ${rating} מתוך 5`}>
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={`w-4 h-4 ${rating >= star ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]' : 'text-slate-700'}`}
        />
      ))}
    </div>
  );
}

/** Owner lock screen for non-owner accounts. */
function LockGate() {
  return (
    <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute -inset-3 bg-emerald-500/15 blur-xl rounded-full" aria-hidden />
        <div className="relative w-full h-full rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-emerald-400" />
        </div>
      </div>
      <h4 className="text-white font-black mb-1">אזור מוגן</h4>
      <p className="text-slate-400 text-sm">הפידבקים פתוחים לחשבון הבעלים בלבד. התחברו עם החשבון המתאים כדי להמשיך.</p>
    </div>
  );
}

/** Shimmering placeholder while the live list loads. */
function LoadingView() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm font-bold">
      <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
      טוען פידבקים...
    </div>
  );
}

/** Empty state when no feedback exists yet. */
function EmptyView() {
  return (
    <div className="text-center py-12">
      <div className="relative w-16 h-16 mx-auto mb-3">
        <div className="absolute -inset-2 bg-emerald-500/10 blur-xl rounded-full" aria-hidden />
        <div className="relative w-full h-full rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
          <Inbox className="w-7 h-7 text-slate-500" />
        </div>
      </div>
      <p className="text-slate-300 font-bold text-sm">אין פידבקים עדיין</p>
      <p className="text-slate-500 text-xs mt-1">פידבקים חדשים יופיעו כאן בזמן אמת</p>
    </div>
  );
}

/** One feedback card: stars, author, requested improvements, meta line. */
function FeedbackCard({ item, index, confirmDelete, onAskDelete, onConfirmDelete, onCancelDelete }: {
  item: FeedbackEntry;
  index: number;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * STAGGER_STEP, STAGGER_MAX), duration: 0.3 }}
      className="group relative overflow-hidden bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-emerald-400/25 rounded-2xl p-4 transition-colors"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <StarRow rating={item.rating || 0} />
          <span className="text-[11px] font-black text-slate-200 tabular-nums">{item.rating || 0}/5</span>
          <span className="text-xs text-slate-500 font-bold truncate" dir="ltr">{item.uid || 'anon'}</span>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <DangerButton onClick={onConfirmDelete}>מחק</DangerButton>
            <GhostButton onClick={onCancelDelete}>ביטול</GhostButton>
          </div>
        ) : (
          <button
            onClick={onAskDelete}
            className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
            title="מחק"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {item.improvements && (
        <div className="bg-yellow-500/[0.07] border border-yellow-500/25 rounded-xl p-3 mb-2.5">
          <div className="text-[10px] text-yellow-400 font-black mb-1">שיפורים מבוקשים</div>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{item.improvements}</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium flex-wrap">
        {item.season && <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10">{item.season}</span>}
        {item.language && <span>{item.language}</span>}
        {formatTime(item.createdAt) && <span>{formatTime(item.createdAt)}</span>}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The modal: owner gate -> live list (stats, toolbar, cards)
// ---------------------------------------------------------------------------

export default function FeedbackAdminModal({ isOpen, onClose }: FeedbackAdminModalProps) {
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

  /** Snapshot (live or manual) -> newest-first entries. RTDB reads ascending. */
  const applySnapshot = (val: any) => {
    const entries: FeedbackEntry[] = [];
    Object.entries(val || {}).forEach(([id, data]: [string, any]) => {
      entries.push({
        id,
        rating: data.rating,
        improvements: data.improvements,
        uid: data.uid,
        season: data.season,
        language: data.language,
        createdAt: data.createdAt,
      });
    });
    setItems(entries.reverse());
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
    } catch (e) {
      console.warn("delete feedback failed:", e);
    }
    setConfirmDeleteId(null);
  };

  /** Two-tap wipe-all, chunked so one giant write never hits server limits. */
  const handleClearAll = async () => {
    try {
      const ids = items.map(i => i.id);
      for (let i = 0; i < ids.length; i += BULK_CHUNK) {
        const updates: Record<string, null> = {};
        ids.slice(i, i + BULK_CHUNK).forEach(id => { updates[`referee/feedback/${id}`] = null; });
        await update(ref(rtdb), updates);
      }
    } catch (e) {
      console.warn("clear all feedback failed:", e);
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
    setTimerReset(true);
    setTimeout(() => setTimerReset(false), TIMER_CONFIRM_MS);
  };

  const total = items.length;
  const avg = total > 0 ? items.reduce((s, i) => s + (i.rating || 0), 0) / total : 0;
  const highCount = items.filter(i => (i.rating || 0) >= HIGH_RATING).length;
  const lowCount = items.filter(i => (i.rating || 0) <= LOW_RATING).length;

  // No early return on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 md:p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-emerald-400/25 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(52,211,153,0.08)]"
          >
            {/* Header: glowing identity + live pulse + close */}
            <div className="px-5 md:px-6 pt-4 md:pt-5 pb-4 border-b border-white/10 bg-white/[0.03] shrink-0 relative overflow-hidden">
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-96 h-32 bg-emerald-400/[0.08] rounded-full blur-3xl pointer-events-none" aria-hidden />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="absolute -inset-2 bg-emerald-500/20 blur-xl rounded-full pointer-events-none" aria-hidden />
                    <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-emerald-500/10 border border-emerald-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.25)]">
                      <MessageSquareHeart className="w-5 h-5 text-emerald-300" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-white leading-tight">פידבק על השופט הווירטואלי</h3>
                    <p className="text-[11px] md:text-xs text-slate-400 font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
                      מתעדכן בזמן אמת מ-Realtime Database
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                  aria-label="סגור"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="h-[2px] shrink-0 bg-gradient-to-l from-transparent via-emerald-400/60 to-transparent" aria-hidden />

            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4">
              {timerReset && (
                <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-sm font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" aria-hidden />
                  טיימר הפידבק אופס לכולם, הטופס יקפוץ שוב אחרי התשובה הבאה
                </div>
              )}

              {!unlocked ? (
                <LockGate />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2.5 md:gap-3">
                    <StatTile value={String(total)} label='סה"כ פידבקים' glow="white" />
                    <StatTile value={total > 0 ? avg.toFixed(1) : '—'} label="ממוצע ציון" glow="gold" />
                    <StatTile value={String(highCount)} label="ציון 4-5" glow="green" />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm text-slate-400 font-bold">
                      {total} {total === 1 ? 'פידבק' : 'פידבקים'}
                      {lowCount > 0 && <span className="text-red-300/90"> • {lowCount} בציון נמוך (1-2)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <GhostButton
                        onClick={resetPopupTimer}
                        disabled={resettingTimer}
                        title="מאפס את טיימר הטופס הקופץ של הפידבק לכל המשתמשים בכל המכשירים"
                      >
                        {resettingTimer ? 'מאפס...' : 'אפס טיימר פידבק לכולם'}
                      </GhostButton>
                      <GhostButton onClick={refreshFromServer} disabled={refreshing}>
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        רענון
                      </GhostButton>
                      {total > 0 && (
                        confirmClearAll ? (
                          <div className="flex items-center gap-1.5">
                            <DangerButton onClick={handleClearAll}>מחק הכול</DangerButton>
                            <GhostButton onClick={() => setConfirmClearAll(false)}>ביטול</GhostButton>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClearAll(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-500/25 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            מחק הכול
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {loading ? (
                      <LoadingView />
                    ) : items.length === 0 ? (
                      <EmptyView />
                    ) : (
                      items.map((item, idx) => (
                        <FeedbackCard
                          key={item.id}
                          item={item}
                          index={idx}
                          confirmDelete={confirmDeleteId === item.id}
                          onAskDelete={() => setConfirmDeleteId(item.id)}
                          onConfirmDelete={() => handleDelete(item.id)}
                          onCancelDelete={() => setConfirmDeleteId(null)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
