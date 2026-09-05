import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Lock,
  ScrollText,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Check,
  MessageCircle,
  Bot,
  Sparkles,
  CalendarDays,
  ArrowDownWideNarrow,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isCurrentUserOwner } from '../lib/owner';

interface RefereeLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECRET_CODE = 'fLl';

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

function toDate(v: any): Date | null {
  if (!v) return null;
  try {
    if (typeof v.toDate === 'function') return v.toDate();
    if (v.seconds) return new Date(v.seconds * 1000);
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
}

function timeAgo(v: any): string {
  const d = toDate(v);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ממש עכשיו';
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.floor(min / 60);
  if (h < 24) return `לפני ${h} שעות`;
  const days = Math.floor(h / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

function fullDate(v: any): string {
  const d = toDate(v);
  if (!d) return '';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function inLastDays(v: any, days: number): boolean {
  const d = toDate(v);
  if (!d) return false;
  return Date.now() - d.getTime() <= days * 24 * 60 * 60 * 1000;
}

export default function RefereeLogsModal({ isOpen, onClose }: RefereeLogsModalProps) {
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortNew, setSortNew] = useState(true);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmOld, setConfirmOld] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Deletes require a live owner Firebase session (server rule), so gate
  // the buttons explicitly instead of failing on the server. Reading is
  // allowed for any signed-in user with the code.
  const canDelete = isCurrentUserOwner();

  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setError(false);
      setUnlocked(false);
      setExpanded(new Set());
      setSearch('');
      setFilter('all');
      setSortNew(true);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    setLoadError(false);
    const q = query(collection(db, 'referee_logs'), orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const entries: LogEntry[] = [];
        snap.docs.forEach((d) => {
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
      },
      (err) => {
        console.error('referee logs snapshot failed:', err);
        setLoadError(true);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [unlocked]);

  const handleUnlock = () => {
    if (code.trim() === SECRET_CODE) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'referee_logs', id));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      console.error('referee log delete failed:', err);
      const code = err?.code ? ` (${String(err.code)})` : '';
      setDeleteError(`המחיקה נכשלה${code}. בדוק חיבור לאינטרנט וודא שאתה מחובר עם חשבון הבעלים, ונסה שוב.`);
      setTimeout(() => setDeleteError(null), 10000);
    } finally {
      setDeletingId(null);
    }
  };

  const cleanOldLogs = async () => {
    if (!confirmOld) {
      setConfirmOld(true);
      return;
    }
    setCleaning(true);
    try {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const batch = writeBatch(db);
      let n = 0;
      for (const l of logs) {
        const d = toDate(l.createdAt);
        if (d && d.getTime() < cutoff && n < 400) {
          batch.delete(doc(db, 'referee_logs', l.id));
          n++;
        }
      }
      if (n > 0) await batch.commit();
    } catch (err: any) {
      console.error('referee log bulk clean failed:', err);
      const code = err?.code ? ` (${String(err.code)})` : '';
      setDeleteError(`ניקוי הרשומות הישנות נכשל${code}. ודא חיבור כבעלים ונסה שוב.`);
      setTimeout(() => setDeleteError(null), 10000);
      return;
    } finally {
      setCleaning(false);
      setConfirmOld(false);
    }
  };

  const copyText = async (key: string, text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      return;
    }
  };

  const counts = useMemo(() => {
    return {
      total: logs.length,
      today: logs.filter((l) => inLastDays(l.createdAt, 1)).length,
      week: logs.filter((l) => inLastDays(l.createdAt, 7)).length,
      month: logs.filter((l) => inLastDays(l.createdAt, 30)).length,
    };
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = logs.filter((l) => {
      if (filter === 'today' && !inLastDays(l.createdAt, 1)) return false;
      if (filter === 'week' && !inLastDays(l.createdAt, 7)) return false;
      if (filter === 'month' && !inLastDays(l.createdAt, 30)) return false;
      if (!q) return true;
      return (
        (l.question || '').toLowerCase().includes(q) ||
        (l.answer || '').toLowerCase().includes(q) ||
        (l.season || '').toLowerCase().includes(q)
      );
    });
    if (!sortNew) list = [...list].reverse();
    return list;
  }, [logs, search, filter, sortNew]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 md:p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
          >
            <div className="flex w-full h-1 shrink-0" aria-hidden>
              <div className="flex-1 bg-blue-600" />
              <div className="flex-1 bg-white" />
              <div className="flex-1 bg-red-600" />
            </div>

            <div className="px-5 md:px-6 pt-4 md:pt-5 pb-4 border-b border-white/10 bg-white/[0.03] shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="absolute -inset-2 rounded-full pointer-events-none" aria-hidden>
                      <div className="absolute inset-0 bg-blue-500/25 blur-xl rounded-full" />
                      <div className="absolute inset-0 bg-red-500/15 blur-xl rounded-full" />
                    </div>
                    <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-red-600 p-[2px] shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
                      <div className="w-full h-full rounded-2xl bg-slate-900 flex items-center justify-center">
                        <ScrollText className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-white leading-tight">יומן שאלות ותשובות</h3>
                    <p className="text-[11px] md:text-xs text-slate-400 font-medium">
                      {unlocked ? `סך הכל ${counts.total} רשומות` : 'גישה לשופטים ראשיים בלבד'}
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

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {!unlocked ? (
                <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute -inset-3 bg-blue-500/15 blur-xl rounded-full" aria-hidden />
                    <div className="relative w-full h-full rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-blue-400" />
                    </div>
                  </div>
                  <h4 className="text-white font-black mb-1">אזור מוגן</h4>
                  <p className="text-slate-400 text-sm mb-5">הזינו קוד כדי לצפות ביומן</p>
                  <input
                    type="password"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    placeholder="קוד גישה"
                    className={`w-full px-4 py-3 rounded-xl bg-slate-800/80 border text-white placeholder-slate-500 outline-none focus:ring-2 transition-all text-center font-bold tracking-widest ${
                      error ? 'border-red-500 focus:ring-red-500/30' : 'border-white/10 focus:ring-blue-500/30 focus:border-blue-500/50'
                    }`}
                  />
                  {error && <p className="text-red-400 text-xs font-bold mt-2">קוד שגוי, נסו שוב</p>}
                  <button
                    onClick={handleUnlock}
                    className="mt-4 w-full py-3 rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white font-black transition-all shadow-[0_8px_20px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    כניסה ליומן
                  </button>
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="חיפוש בשאלה, בתשובה או בעונה"
                          className="w-full pr-9 pl-9 py-2.5 rounded-xl bg-slate-800/70 border border-white/10 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 text-sm transition-all"
                        />
                        {search && (
                          <button
                            onClick={() => setSearch('')}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-white/5 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                            aria-label="נקה חיפוש"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setSortNew((v) => !v)}
                        title={sortNew ? 'החדש ביותר למעלה' : 'הישן ביותר למעלה'}
                        className="shrink-0 h-[42px] px-3 rounded-xl bg-slate-800/70 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                      >
                        <ArrowDownWideNarrow className="w-4 h-4 text-blue-400" />
                        <span className="hidden sm:inline">{sortNew ? 'חדש קודם' : 'ישן קודם'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {(
                        [
                          { key: 'all', label: 'הכל' },
                          { key: 'today', label: 'היום' },
                          { key: 'week', label: '7 ימים' },
                          { key: 'month', label: '30 ימים' },
                        ] as const
                      ).map((c) => (
                        <button
                          key={c.key}
                          onClick={() => setFilter(c.key)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-black border transition-all cursor-pointer ${
                            filter === c.key
                              ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white border-blue-500 shadow-[0_4px_12px_rgba(37,99,235,0.35)]'
                              : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                      {(search || filter !== 'all') && (
                        <button
                          onClick={() => {
                            setSearch('');
                            setFilter('all');
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          איפוס
                        </button>
                      )}
                      <button
                        onClick={cleanOldLogs}
                        disabled={cleaning || logs.length === 0 || !canDelete}
                        title={canDelete ? undefined : 'ניקוי לבעלים בלבד'}
                        className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-400 hover:text-red-300 border border-white/10 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {cleaning ? 'מנקה' : confirmOld ? 'לחצו שוב למחיקת ישנות מ90 יום' : 'נקה ישנות מ90 יום'}
                      </button>
                      <span className="mr-auto text-[11px] text-slate-500 font-medium">
                        מציג {filtered.length} מתוך {counts.total}
                      </span>
                    </div>
                  </div>

                  {!canDelete && (
                    <div className="mx-4 md:mx-5 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-200 shrink-0">
                      צפייה בלבד — מחיקת רשומות זמינה לחשבון הבעלים בלבד.
                    </div>
                  )}
                  {loadError && (
                    <div className="mx-4 md:mx-5 mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-200 shrink-0">
                      טעינת היומן מהשרת נכשלה — בדוק חיבור לאינטרנט והרשאות.
                    </div>
                  )}
                  {deleteError && (
                    <div className="mx-4 md:mx-5 mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-200 shrink-0">
                      {deleteError}
                    </div>
                  )}

                  <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4 space-y-3">
                    {loading ? (
                      [0, 1, 2].map((i) => (
                        <div key={i} className="rounded-2xl border border-white/5 bg-slate-800/40 p-4 animate-pulse">
                          <div className="h-4 w-3/4 rounded bg-slate-700/60 mb-3" />
                          <div className="h-3 w-1/2 rounded bg-slate-700/40" />
                        </div>
                      ))
                    ) : filtered.length === 0 ? (
                      <div className="text-center py-14">
                        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                          <Sparkles className="w-6 h-6 text-slate-500" />
                        </div>
                        <p className="text-slate-300 font-bold text-sm">אין תוצאות</p>
                        <p className="text-slate-500 text-xs mt-1">נסו לחפש משהו אחר או לאפס סינון</p>
                      </div>
                    ) : (
                      filtered.map((entry, idx) => {
                        const isExpanded = expanded.has(entry.id);
                        return (
                          <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.3 }}
                            className={`rounded-2xl border overflow-hidden transition-colors ${
                              isExpanded
                                ? 'border-blue-500/30 bg-slate-800/70 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
                                : 'border-white/8 bg-slate-800/40 hover:border-white/15 hover:bg-slate-800/60'
                            }`}
                          >
                            <div
                              onClick={() => toggleExpand(entry.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && toggleExpand(entry.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-right"
                            >
                              <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border bg-blue-500/10 border-blue-500/25 text-blue-300">
                                <MessageCircle className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-white truncate leading-snug">
                                  {entry.question || 'ללא שאלה'}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {entry.season && (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-200">
                                      {entry.season}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3" />
                                    {timeAgo(entry.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(entry.id);
                                  }}
                                  disabled={deletingId === entry.id || !canDelete}
                                  className="p-2 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500 disabled:hover:bg-transparent"
                                  title={canDelete ? 'מחיקת רשומה' : 'מחיקה לבעלים בלבד'}
                                >
                                  {deletingId === entry.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                                <div className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-blue-300" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                              </div>
                            </div>

                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4 space-y-2.5">
                                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] p-3.5">
                                      <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="flex items-center gap-1.5 text-[11px] font-black text-blue-200">
                                          <MessageCircle className="w-3.5 h-3.5" />
                                          שאלה
                                        </span>
                                        <button
                                          onClick={() => copyText(`${entry.id}q`, entry.question)}
                                          className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                                        >
                                          {copiedId === `${entry.id}q` ? (
                                            <>
                                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                                              <span className="text-emerald-400">הועתק</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3.5 h-3.5" />
                                              העתק
                                            </>
                                          )}
                                        </button>
                                      </div>
                                      <div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                                        {entry.question}
                                      </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                                      <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="flex items-center gap-1.5 text-[11px] font-black text-slate-200">
                                          <Bot className="w-3.5 h-3.5" />
                                          תשובה
                                        </span>
                                        <button
                                          onClick={() => copyText(`${entry.id}a`, entry.answer)}
                                          className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                                        >
                                          {copiedId === `${entry.id}a` ? (
                                            <>
                                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                                              <span className="text-emerald-400">הועתק</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3.5 h-3.5" />
                                              העתק
                                            </>
                                          )}
                                        </button>
                                      </div>
                                      <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                                        {entry.answer || 'אין תשובה שמורה'}
                                      </div>
                                    </div>

                                    <div className="px-1">
                                      <span className="text-[10px] text-slate-500 font-medium">
                                        {fullDate(entry.createdAt)}
                                      </span>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
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
