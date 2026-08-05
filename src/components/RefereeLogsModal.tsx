import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, ScrollText, MessageSquareText, Search, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface RefereeLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECRET_CODE = 'FLL';

type LogEntry = {
  id: string;
  question?: string;
  answer?: string;
  season?: string;
  language?: string;
  uid?: string;
  model?: string;
  ok?: boolean;
  createdAt?: any;
};

export default function RefereeLogsModal({ isOpen, onClose }: RefereeLogsModalProps) {
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setError(false);
      setUnlocked(false);
      setExpanded(new Set());
      setSearch('');
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    const q = query(collection(db, 'referee_logs'), orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      const entries: LogEntry[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        entries.push({
          id: d.id,
          question: data.question,
          answer: data.answer,
          season: data.season,
          language: data.language,
          uid: data.uid,
          model: data.model,
          ok: data.ok,
          createdAt: data.createdAt,
        });
      });
      setLogs(entries);
      setLoading(false);
    }, (err) => {
      console.warn("referee logs snapshot failed:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [unlocked]);

  const handleUnlock = () => {
    if (code.trim().toLowerCase() === SECRET_CODE.toLowerCase()) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = logs.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (l.question || '').toLowerCase().includes(q) || (l.answer || '').toLowerCase().includes(q);
  });

  const formatTime = (ts: any): string => {
    if (!ts) return '...';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-black text-white">יומן שאלות ותשובות</h3>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex-1 min-h-0 flex flex-col overflow-hidden">
              {!unlocked ? (
                <div className="space-y-4 m-auto w-full max-w-sm py-6">
                  <div className="text-center py-2">
                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                      <Lock className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-400 text-sm">הזן קוד כדי לגשת ליומן</p>
                  </div>
                  <input
                    type="password"
                    value={code}
                    onChange={e => { setCode(e.target.value); setError(false); }}
                    onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                    placeholder="קוד"
                    className={`w-full px-4 py-3 rounded-lg bg-slate-800 border text-white placeholder-slate-500 outline-none focus:ring-2 transition-all ${
                      error ? 'border-red-500 focus:ring-red-500/40' : 'border-slate-700 focus:ring-yellow-500/40 focus:border-yellow-500'
                    }`}
                  />
                  {error && <p className="text-red-500 text-xs font-semibold">קוד שגוי</p>}
                  <button
                    onClick={handleUnlock}
                    className="w-full py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black transition-colors shadow-lg shadow-yellow-500/20"
                  >
                    כניסה
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1 min-h-0">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="חיפוש בשאלה או בתשובה..."
                        className="w-full pr-9 pl-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-yellow-500 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold shrink-0">
                      <MessageSquareText className="w-4 h-4 text-yellow-400" />
                      {logs.length}
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                    {loading ? (
                      <div className="flex items-center justify-center py-10 text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin ml-2" />
                        טוען יומן...
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 text-sm">
                        אין רשומות עדיין
                      </div>
                    ) : (
                      filtered.map(entry => {
                        const isExpanded = expanded.has(entry.id);
                        return (
                          <div key={entry.id} className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
                            <button
                              onClick={() => toggleExpand(entry.id)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-800 transition-colors text-right"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-yellow-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                                <span className="text-sm font-bold text-white truncate">
                                  {entry.question || '(ללא שאלה)'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${entry.ok === false ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                  {entry.ok === false ? 'שגיאה' : 'OK'}
                                </span>
                                <span className="text-[11px] text-slate-400">{formatTime(entry.createdAt)}</span>
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 space-y-2">
                                <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                                  <div className="text-[10px] text-yellow-500 font-black mb-1">שאלה</div>
                                  <div className="text-sm text-slate-200 whitespace-pre-wrap break-words">{entry.question}</div>
                                </div>
                                <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                                  <div className="text-[10px] text-emerald-400 font-black mb-1">תשובה</div>
                                  <div className="text-sm text-slate-200 whitespace-pre-wrap break-words">{entry.answer}</div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {entry.season && <span className="text-[10px] font-bold text-slate-400 bg-slate-700/60 rounded px-1.5 py-0.5">עונה: {entry.season}</span>}
                                  {entry.language && <span className="text-[10px] font-bold text-slate-400 bg-slate-700/60 rounded px-1.5 py-0.5">שפה: {entry.language}</span>}
                                  {entry.uid && <span className="text-[10px] font-bold text-slate-400 bg-slate-700/60 rounded px-1.5 py-0.5">משתמש: {entry.uid}</span>}
                                  {entry.model && <span className="text-[10px] font-bold text-slate-400 bg-slate-700/60 rounded px-1.5 py-0.5">מודל: {entry.model}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
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
