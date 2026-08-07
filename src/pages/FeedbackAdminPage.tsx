import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowRight, Star, MessageSquareHeart, RefreshCw, Trash2, ArrowLeft, Inbox } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, writeBatch, getDocsFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';

const SECRET_PASSWORD = '2601';
const AUTO_UNLOCK_KEY = 'referee_feedback_unlocked';

type FeedbackEntry = {
  id: string;
  rating?: number;
  improvements?: string;
  uid?: string;
  season?: string;
  language?: string;
  createdAt?: any;
};

export default function FeedbackAdminPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timerReset, setTimerReset] = useState(false);

  const resetPopupTimer = () => {
    localStorage.removeItem('referee_feedback_last_prompt');
    localStorage.removeItem('referee_feedback_submitted_at');
    setTimerReset(true);
    setTimeout(() => setTimerReset(false), 4000);
  };

  const applySnapshot = (snap: any) => {
    const entries: FeedbackEntry[] = [];
    snap.docs.forEach((d: any) => {
      const data = d.data();
      entries.push({
        id: d.id,
        rating: data.rating,
        improvements: data.improvements,
        uid: data.uid,
        season: data.season,
        language: data.language,
        createdAt: data.createdAt,
      });
    });
    setItems(entries);
    setLoading(false);
  };

  const refreshFromServer = async () => {
    setRefreshing(true);
    try {
      const q = query(collection(db, 'referee_feedback'), orderBy('createdAt', 'desc'), limit(300));
      const snap = await getDocsFromServer(q);
      applySnapshot(snap);
    } catch (e) {
      console.warn("refresh feedback failed:", e);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (sessionStorage.getItem(AUTO_UNLOCK_KEY) === '1') {
      sessionStorage.removeItem(AUTO_UNLOCK_KEY);
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    const q = query(collection(db, 'referee_feedback'), orderBy('createdAt', 'desc'), limit(300));
    const unsub = onSnapshot(q, applySnapshot, (err) => {
      console.warn("feedback snapshot failed:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [unlocked]);

  const handleUnlock = () => {
    if (password.trim() === SECRET_PASSWORD) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'referee_feedback', id));
    } catch (e) {
      console.warn("delete feedback failed:", e);
    }
    setConfirmDeleteId(null);
  };

  const handleClearAll = async () => {
    try {
      const batch = writeBatch(db);
      items.forEach(i => batch.delete(doc(db, 'referee_feedback', i.id)));
      await batch.commit();
    } catch (e) {
      console.warn("clear all feedback failed:", e);
    }
    setConfirmClearAll(false);
  };

  const formatTime = (ts: any): string => {
    if (!ts) return '';
    const seconds = typeof ts.seconds === 'number' ? ts.seconds : ts;
    try {
      return new Date(seconds * 1000).toLocaleString('he-IL');
    } catch {
      return '';
    }
  };

  const total = items.length;
  const avg = total > 0 ? items.reduce((s, i) => s + (i.rating || 0), 0) / total : 0;
  const highCount = items.filter(i => (i.rating || 0) >= 4).length;
  const lowCount = items.filter(i => (i.rating || 0) <= 2).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <MessageSquareHeart className="w-6 h-6 text-yellow-400" />
            <h1 className="text-xl md:text-2xl font-black">פידבק על השופט הווירטואלי</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetPopupTimer}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 transition-colors"
              title="מאפס את טיימר הטופס הקופץ של הפידבק במכשיר הזה"
            >
              <RefreshCw className="w-4 h-4" />
              אפס את טיימר הפידבק
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              חזרה לאפליקציה
            </button>
          </div>
        </div>

        {timerReset && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-sm font-bold">
            טיימר הפידבק אופס - הטופס יקפוץ שוב אחרי התשובה הבאה
          </div>
        )}

        {!unlocked ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm mx-auto"
          >
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-slate-400 text-sm mb-4">הזן סיסמה כדי לצפות בפידבקים</p>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              placeholder="סיסמה"
              className={`w-full px-4 py-3 rounded-lg bg-slate-800 border text-white placeholder-slate-500 outline-none focus:ring-2 transition-all ${
                error ? 'border-red-500 focus:ring-red-500/40' : 'border-slate-700 focus:ring-yellow-500/40 focus:border-yellow-500'
              }`}
            />
            {error && <p className="text-red-500 text-xs font-semibold mt-2">סיסמה שגויה</p>}
            <button
              onClick={handleUnlock}
              className="w-full mt-4 py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black transition-colors shadow-lg shadow-yellow-500/20"
            >
              כניסה
            </button>
          </motion.div>
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
                <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  חי בזמן אמת
                </div>
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
    </div>
  );
}
