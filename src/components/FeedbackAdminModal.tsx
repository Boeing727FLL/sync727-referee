import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Star, MessageSquareHeart, RefreshCw, Trash2, Inbox } from 'lucide-react';
import { onValue, get, remove, ref, update } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { feedbackQuery, resetFeedbackForAll } from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';

interface FeedbackAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FeedbackEntry = {
  id: string;
  rating?: number;
  improvements?: string;
  uid?: string;
  season?: string;
  language?: string;
  createdAt?: any;
};

function toMs(ts: any): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts < 1e11 ? ts * 1000 : ts;
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return null;
}

function formatTime(ts: any): string {
  const ms = toMs(ts);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('he-IL');
  } catch {
    return '';
  }
}

export default function FeedbackAdminModal({ isOpen, onClose }: FeedbackAdminModalProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timerReset, setTimerReset] = useState(false);

  const [resettingTimer, setResettingTimer] = useState(false);
  const resetPopupTimer = async () => {
    if (resettingTimer) return;
    setResettingTimer(true);
    try {
      // Server-side: wipe suppression for EVERYONE (all users, all devices).
      await resetFeedbackForAll();
    } catch (e) {
      console.warn('global feedback reset failed:', e);
    }
    try {
      // Local: clear all timer keys on this device too (plus legacy ones).
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
    setTimeout(() => setTimerReset(false), 4000);
  };

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
    // RTDB returns ascending; newest first.
    setItems(entries.reverse());
    setLoading(false);
  };

  const refreshFromServer = async () => {
    setRefreshing(true);
    try {
      const snap = await get(feedbackQuery(300));
      applySnapshot(snap.val());
    } catch (e) {
      console.warn("refresh feedback failed:", e);
    }
    setRefreshing(false);
  };

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

  useEffect(() => {
    if (!isOpen || !unlocked) return;
    setLoading(true);
    const unsub = onValue(feedbackQuery(300), (snap) => {
      applySnapshot(snap.val());
    }, (err) => {
      console.warn("feedback snapshot failed:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [isOpen, unlocked]);

  const handleDelete = async (id: string) => {
    try {
      await remove(ref(rtdb, `referee/feedback/${id}`));
    } catch (e) {
      console.warn("delete feedback failed:", e);
    }
    setConfirmDeleteId(null);
  };

  const handleClearAll = async () => {
    try {
      const ids = items.map(i => i.id);
      for (let i = 0; i < ids.length; i += 100) {
        const updates: Record<string, null> = {};
        ids.slice(i, i + 100).forEach(id => { updates[`referee/feedback/${id}`] = null; });
        await update(ref(rtdb), updates);
      }
    } catch (e) {
      console.warn("clear all feedback failed:", e);
    }
    setConfirmClearAll(false);
  };

  const total = items.length;
  const avg = total > 0 ? items.reduce((s, i) => s + (i.rating || 0), 0) / total : 0;
  const highCount = items.filter(i => (i.rating || 0) >= 4).length;
  const lowCount = items.filter(i => (i.rating || 0) <= 2).length;

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
            className="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
          >
            <div className="px-5 md:px-6 pt-4 md:pt-5 pb-4 border-b border-white/10 bg-white/[0.03] shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <MessageSquareHeart className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-white leading-tight">פידבק על השופט הווירטואלי</h3>
                    <p className="text-[11px] md:text-xs text-slate-400 font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      מתעדכן בזמן אמת מ-Realtime Database
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                  aria-label="סגור"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4">
              {timerReset && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-sm font-bold">
                  טיימר הפידבק אופס לכולם - הטופס יקפוץ שוב אחרי התשובה הבאה
                </div>
              )}

              {!unlocked ? (
                <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                    <Lock className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-400 text-sm">הפידבקים פתוחים לחשבון הבעלים בלבד. התחברו עם החשבון המתאים כדי להמשיך.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
                      <div className="text-2xl font-black text-white">{total}</div>
                      <div className="text-[11px] text-slate-400 font-semibold mt-1">סה"כ פידבקים</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
                      <div className="text-2xl font-black text-yellow-400">{total > 0 ? avg.toFixed(1) : '—'}</div>
                      <div className="text-[11px] text-slate-400 font-semibold mt-1">ממוצע ציון</div>
                    </div>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center">
                      <div className="text-2xl font-black text-emerald-400">{highCount}</div>
                      <div className="text-[11px] text-slate-400 font-semibold mt-1">ציון 4-5</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-400 font-bold">
                      {total} {total === 1 ? 'פידבק' : 'פידבקים'}
                      {lowCount > 0 && ` • ${lowCount} בציון נמוך (1-2)`}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={resetPopupTimer}
                        disabled={resettingTimer}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors disabled:opacity-50"
                        title="מאפס את טיימר הטופס הקופץ של הפידבק לכל המשתמשים בכל המכשירים"
                      >
                        {resettingTimer ? 'מאפס...' : 'אפס טיימר פידבק לכולם'}
                      </button>
                      <button
                        onClick={refreshFromServer}
                        disabled={refreshing}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        רענון
                      </button>
                      {total > 0 && (
                        confirmClearAll ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={handleClearAll}
                              className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-400 transition-colors"
                            >
                              מחק הכול
                            </button>
                            <button
                              onClick={() => setConfirmClearAll(false)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors"
                            >
                              ביטול
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClearAll(true)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            מחק הכול
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {loading ? (
                      <div className="flex items-center justify-center py-10 text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin ml-2" />
                        טוען פידבקים...
                      </div>
                    ) : items.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 text-sm">
                        <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        אין פידבקים עדיין
                      </div>
                    ) : (
                      items.map(item => (
                        <div key={item.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-0.5" dir="ltr">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <Star
                                    key={star}
                                    className={`w-4 h-4 ${(item.rating || 0) >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'}`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-slate-500 font-bold">{item.uid || 'anon'}</span>
                            </div>
                            {confirmDeleteId === item.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-400 transition-colors"
                                >
                                  מחק
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors"
                                >
                                  ביטול
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(item.id)}
                                className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500/30 transition-colors"
                                title="מחק"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {item.improvements && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5 mb-2">
                              <div className="text-[10px] text-yellow-500 font-black mb-1">שיפורים מבוקשים</div>
                              <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{item.improvements}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            {item.season && <span>עונה: {item.season}</span>}
                            {item.language && <span>שפה: {item.language}</span>}
                            {formatTime(item.createdAt) && <span>{formatTime(item.createdAt)}</span>}
                          </div>
                        </div>
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
