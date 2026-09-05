import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Lock,
  Gavel,
  Search,
  Save,
  RotateCcw,
  Trash2,
  Plus,
  Check,
  Loader2,
  ListOrdered,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { invalidateCorrectionsCache } from '../services/geminiService';
import { isCurrentUserOwner } from '../lib/owner';

interface JudgeCorrectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JudgeCorrectionsModal({ isOpen, onClose }: JudgeCorrectionsModalProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [initialText, setInitialText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [newLine, setNewLine] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setLines([]);
      setInitialText('');
      setSearch('');
      setNewLine('');
      setSaved(false);
      setUpdatedAt(null);
      return;
    }
    // Access is decided by the signed-in account, no code anymore.
    setUnlocked(isCurrentUserOwner());
  }, [isOpen]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'app_config', 'corrections'));
      const t = snap.exists() ? String(snap.data().text || '') : '';
      const u = snap.exists() ? Number(snap.data().updatedAt || 0) : 0;
      setLines(t ? t.split('\n') : []);
      setInitialText(t);
      setUpdatedAt(u || null);
    } catch {
      return;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlocked && isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const now = Date.now();
      const t = lines.join('\n');
      await setDoc(doc(db, 'app_config', 'corrections'), { text: t, updatedAt: now });
      invalidateCorrectionsCache();
      setInitialText(t);
      setUpdatedAt(now);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  };

  const nonEmptyCount = useMemo(() => lines.filter((l) => l.trim().length > 0).length, [lines]);

  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = lines.map((line, index) => ({ line, index }));
    if (!q) return all;
    return all.filter((o) => o.line.toLowerCase().includes(q));
  }, [lines, search]);

  const deleteLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const editLine = (index: number, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === index ? value : l)));
  };

  const addLine = () => {
    const v = newLine.trim();
    if (!v) return;
    setLines((prev) => [...prev, v]);
    setNewLine('');
  };

  const dirty = lines.join('\n') !== initialText;

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
            className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
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
                        <Gavel className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-white leading-tight">תיקון שופט</h3>
                    <p className="text-[11px] md:text-xs text-slate-400 font-medium">
                      {unlocked ? `סך הכל ${nonEmptyCount} תיקונים` : 'גישה לשופטים ראשיים בלבד'}
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
                  <p className="text-slate-400 text-sm">עריכת תיקונים פתוחה לחשבון הבעלים בלבד. התחברו עם החשבון המתאים כדי להמשיך.</p>
                </div>
              ) : loading ? (
                <div className="m-auto px-6 py-10 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm font-bold">טוען תיקונים</p>
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      לחצו על תיקון כדי לערוך אותו ישירות. כל שורה נשמרת כתיקון אחד שהשופט יקח בחשבון.
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-sm transition-all cursor-pointer disabled:cursor-not-allowed ${
                          saved
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] disabled:opacity-40'
                        }`}
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : saved ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {saved ? 'נשמר' : 'שמור תיקונים'}
                      </button>
                      <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 text-sm font-bold transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        טען מחדש
                      </button>
                      <button
                        onClick={() => setLines([])}
                        disabled={lines.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-red-300 hover:bg-red-500/10 text-sm font-bold transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                        נקה הכל
                      </button>
                      <span className="mr-auto text-[11px] text-slate-500 font-medium">
                        {nonEmptyCount} שורות{updatedAt ? `, עודכן ${new Date(updatedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                        {dirty ? ', יש שינויים שלא נשמרו' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newLine}
                        onChange={(e) => setNewLine(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addLine()}
                        placeholder="הוספת תיקון חדש"
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800/70 border border-white/10 text-white text-base md:text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                        dir="auto"
                      />
                      <button
                        onClick={addLine}
                        disabled={!newLine.trim()}
                        className="shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:text-white hover:bg-white/10 text-sm font-bold transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                        הוסף
                      </button>
                    </div>
                  </div>

                  <div className="px-4 md:px-5 pt-3 shrink-0">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="חיפוש בתיקונים"
                           className="w-full pr-9 pl-9 py-2.5 rounded-xl bg-slate-800/70 border border-white/10 text-white text-base md:text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
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
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold mt-2 mb-1 px-1">
                      <ListOrdered className="w-3.5 h-3.5" />
                      מציג {visibleLines.length} מתוך {nonEmptyCount}
                    </p>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 pb-5 space-y-2">
                    {visibleLines.length === 0 ? (
                      <div className="text-center py-10">
                        <p className="text-slate-300 font-bold text-sm">אין תיקונים עדיין</p>
                        <p className="text-slate-500 text-xs mt-1">הוסיפו תיקון ראשון למעלה</p>
                      </div>
                    ) : (
                      visibleLines.map((o, n) => (
                        <div
                          key={`${o.index}`}
                          className="flex items-start gap-3 rounded-xl border border-white/8 bg-slate-800/40 hover:border-white/15 px-3 py-2.5 transition-colors"
                        >
                          <span className="shrink-0 w-6 h-6 mt-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-200 text-[11px] font-black flex items-center justify-center">
                            {n + 1}
                          </span>
                          <textarea
                            value={o.line}
                            onChange={(e) => editLine(o.index, e.target.value)}
                            rows={2}
                            placeholder="כתבו תיקון"
                            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-950/50 border border-white/10 text-base md:text-sm text-slate-100 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 resize-y transition-all"
                            dir="auto"
                          />
                          <button
                            onClick={() => deleteLine(o.index)}
                            className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
                            title="מחק שורה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
