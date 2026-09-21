/**
 * RefereeLogsModal — the head-referee Q&A journal (floating window).
 *
 * ACCESS MODEL: anyone who knows the head-referee code can READ the journal;
 * only the owner's Firebase session may DELETE entries (enforced by the
 * server rules — the UI just disables the buttons upfront instead of
 * failing silently). The journal itself is language-agnostic: every entry
 * carries the UI `language` it was asked in, and all display strings here
 * are Hebrew. NOTE: there are no translation functions in this file — the
 * app's whole translation system lives in hooks/useLanguage; the only
 * "language work" here is Hebrew date formatting (see below).
 *
 * DATA FLOW: RTDB `referee/logs`, newest 200, live subscription. RTDB
 * returns ascending, so the list is reversed client-side to newest-first.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Lock,
  ScrollText,
  Search,
  ArrowDownWideNarrow,
  RotateCcw,
} from 'lucide-react';
import { onValue, remove, ref, update } from 'firebase/database';
import { rtdb } from '../lib/firebase/rtdb';
import { logsQuery } from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';
import { filterLogs, TIME_FILTERS, toDate, type LogEntry, type TimeFilter } from '../features/referee/logs/model';
import { EmptyState, EntryRow, FilterChip, LoadingSkeleton, NoticeBanner } from '../features/referee/logs/LogViews';
import { chunkedNullUpdates, logEntries } from '../features/referee/data/snapshots';

// ---------------------------------------------------------------------------
// Configuration constants (no magic numbers in logic or JSX below)
// ---------------------------------------------------------------------------

/** Head-referee gate code (case-sensitive). */
const SECRET_CODE = 'fLl';

/** Newest entries kept live in the viewer. */
const LOG_LIMIT = 200;

/** How long the "copied" tick stays on a copy button. */
const COPY_FEEDBACK_MS = 1500;

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

/** Past this age the relative clock gives up and prints a calendar date. */

/** Entrance stagger for journal rows (capped so long lists settle fast). */

interface RefereeLogsModalProps { isOpen: boolean; onClose: () => void; }

// ---------------------------------------------------------------------------
// Presentational pieces (no hooks, no logic — pure props in, JSX out)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The modal: code gate -> live list (search, filter, expand, delete, clean)
// ---------------------------------------------------------------------------

export default function RefereeLogsModal({ isOpen, onClose }: RefereeLogsModalProps) {
  // -- gate state (head-referee code) -----------------------------------------
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);

  // -- live data ----------------------------------------------------------------
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // -- view state (search, time filter, sort, expanded rows) ---------------------
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TimeFilter>('all');
  const [sortNew, setSortNew] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  /** Code gate: exact match opens the journal, anything else shakes the box. */
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

  const copyText = async (key: string, text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      later(() => setCopiedId(null), COPY_FEEDBACK_MS);
    } catch {
      return;
    }
  };

  const filtered = useMemo(() => filterLogs(logs, search, filter, sortNew), [logs, search, filter, sortNew]);

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
                      {unlocked ? `סך הכל ${logs.length} רשומות` : 'גישה לשופטים ראשיים בלבד'}
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
                    className={`w-full px-4 py-3 rounded-xl bg-slate-800/80 border text-white text-base md:text-sm placeholder-slate-500 outline-none focus:ring-2 transition-all text-center font-bold tracking-widest ${
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
                      {TIME_FILTERS.map((c) => (
                        <FilterChip
                          key={c.key}
                          label={c.label}
                          active={filter === c.key}
                          onClick={() => setFilter(c.key)}
                        />
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
                        מציג {filtered.length} מתוך {logs.length}
                      </span>
                    </div>
                  </div>

                  {!canDelete && (
                    <NoticeBanner tone="amber">
                      צפייה בלבד — מחיקת רשומות זמינה לחשבון הבעלים בלבד.
                    </NoticeBanner>
                  )}
                  {loadError && (
                    <NoticeBanner tone="red">
                      טעינת היומן מהשרת נכשלה — בדוק חיבור לאינטרנט והרשאות.
                    </NoticeBanner>
                  )}
                  {deleteError && (
                    <NoticeBanner tone="red">
                      {deleteError}
                    </NoticeBanner>
                  )}

                  <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4 space-y-3">
                    {loading ? (
                      <LoadingSkeleton />
                    ) : filtered.length === 0 ? (
                      <EmptyState />
                    ) : (
                      filtered.map((entry, idx) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          index={idx}
                          isExpanded={expanded.has(entry.id)}
                          onToggle={() => toggleExpand(entry.id)}
                          onDelete={() => handleDelete(entry.id)}
                          canDelete={canDelete}
                          deleting={deletingId === entry.id}
                          copiedKey={copiedId}
                          onCopy={copyText}
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
