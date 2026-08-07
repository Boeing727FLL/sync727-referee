import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowRight, Star, MessageSquareHeart, RefreshCw, Trash2, ArrowLeft, Inbox } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const SECRET_PASSWORD = '2601';
const AUTO_UNLOCK_KEY = 'referee_feedback_unlocked';

type FeedbackEntry = {
  id: string;
  rating?: number;
  comment?: string;
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
    const unsub = onSnapshot(q, (snap) => {
      const entries: FeedbackEntry[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        entries.push({
          id: d.id,
          rating: data.rating,
          comment: data.comment,
          improvements: data.improvements,
          uid: data.uid,
          season: data.season,
          language: data.language,
          createdAt: data.createdAt,
        });
      });
      setItems(entries);
      setLoading(false);
    }, (err) => {
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
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            חזרה לאפליקציה
          </button>
        </div>

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
              <div className="text-[11px] text-slate-500">מתעדכן בזמן אמת</div>
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
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500/30 transition-colors"
                        title="מחק"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {item.comment && (
                      <p className="text-sm text-slate-200 whitespace-pre-wrap break-words mb-2">{item.comment}</p>
                    )}
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
