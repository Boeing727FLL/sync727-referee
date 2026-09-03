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

interface JudgeCorrectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECRET_CODE = '6767';

export default function JudgeCorrectionsModal({ isOpen, onClose }: JudgeCorrectionsModalProps) {
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [text, setText] = useState('');
  const [initialText, setInitialText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [newLine, setNewLine] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setCode('');
      setError(false);
      setUnlocked(false);
      setText('');
      setInitialText('');
      setSearch('');
      setNewLine('');
      setSaved(false);
      setUpdatedAt(null);
      return;
    }
  }, [isOpen]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'app_config', 'corrections'));
      const t = snap.exists() ? String(snap.data().text || '') : '';
      const u = snap.exists() ? Number(snap.data().updatedAt || 0) : 0;
      setText(t);
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

  const handleUnlock = () => {
    if (code.trim() === SECRET_CODE) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const now = Date.now();
      await setDoc(doc(db, 'app_config', 'corrections'), { text, updatedAt: now });
      invalidateCorrectionsCache();
      setInitialText(text);
      setUpdatedAt(now);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      return;
    } finally {
      setSaving(false);
    }
  };

  const lines = useMemo(() => {
    return text
      .split('\n')
      .map((l, i) => ({ line: l, index: i }))
      .filter((o) => o.line.trim().length > 0);
  }, [text]);

  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((o) => o.line.toLowerCase().includes(q));
  }, [lines, search]);

  const deleteLine = (index: number) => {
    setText((prev) => prev.split('\n').filter((_, i) => i !== index).join('\n'));
  };

  const addLine = () => {
    const v = newLine.trim();
    if (!v) return;
    setText((prev) => (prev.trim() ? `${prev.trim()}\n${v}` : v));
    setNewLine('');
  };

  const dirty = text !== initialText;

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
                      {unlocked ? `סך הכל ${lines.length} תיקונים` : 'גישה לשופטים ראשיים בלבד'}
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
                  <p className="text-slate-400 text-sm mb-5">הזינו קוד כדי לערוך תיקוני שופט</p>
                  <input
                    type="password"
                    inputMode="numeric"
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
                    כניסה לעריכה
                  </button>
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
                      כל שורה היא תיקון אחד שהשופט יקח בחשבון בתשובות הבאות. כתבו תיקון אחד בכל שורה.
                    </p>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="תיקון אחד בכל שורה, למשל, משימה 05 הניקוד הנכון הוא 25 נקודות כי"
                      rows={5}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800/70 border border-white/10 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 text-sm leading-relaxed resize-y min-h-[120px] transition-all"
                      dir="auto"
                    />
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
                        onClick={() => setText('')}
                        disabled={!text}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-red-300 hover:bg-red-500/10 text-sm font-bold transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                        נקה הכל
                      </button>
                      <span className="mr-auto text-[11px] text-slate-500 font-medium">
                        {lines.length} שורות{updatedAt ? `, עודכן ${new Date(updatedAt).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
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
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800/70 border border-white/10 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 text-sm transition-all"
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
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold mt-2 mb-1 px-1">
                      <ListOrdered className="w-3.5 h-3.5" />
                      מציג {visibleLines.length} מתוך {lines.length}
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
                          <span className="shrink-0 w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-200 text-[11px] font-black flex items-center justify-center">
                            {n + 1}
                          </span>
                          <p className="flex-1 min-w-0 text-sm text-slate-100 leading-relaxed break-words">{o.line}</p>
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
