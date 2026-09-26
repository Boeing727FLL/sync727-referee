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

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import ModalScrim from './ModalScrim';
import {
  X,
  Lock,
  ScrollText,
  Search,
  ArrowDownWideNarrow,
  RotateCcw,
} from 'lucide-react';
import { filterLogs, TIME_FILTERS } from '../../../features/referee/logs/model';
import { EmptyState, EntryRow, FilterChip, LoadingSkeleton, NoticeBanner } from '../../../features/referee/logs/LogViews';
import { useModalA11y } from '../../../lib/modalA11y';
import useRefereeJournal from '../../../features/referee/logs/useRefereeJournal';

// ---------------------------------------------------------------------------
// Configuration constants (no magic numbers in logic or JSX below)
// ---------------------------------------------------------------------------

/** How long the "copied" tick stays on a copy button. */
const COPY_FEEDBACK_MS = 1500;


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
  const a11yRef = useModalA11y(onClose);
  const {
    code, setCode, error, setError, unlocked, handleUnlock,
    logs, loading, loadError, userNames, canDelete,
    expanded, toggleExpand, search, setSearch, filter, setFilter, sortNew, setSortNew,
    deletingId, deleteError, handleDelete,
    confirmOld, cleaning, cleanOldLogs,
    later,
  } = useRefereeJournal(isOpen);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const filtered = useMemo(() => filterLogs(logs, search, filter, sortNew, Date.now(), userNames), [logs, search, filter, sortNew, userNames]);

  // No early return on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation.
  return (
    <ModalScrim isOpen={isOpen} isRTL layerClass="z-[9999] modal-safe-3" quickFade onClose={onClose}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="v12-sheet w-full max-w-4xl max-h-[90dvh] flex flex-col"
            ref={a11yRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >

            <div className="px-5 md:px-6 pt-5 pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="v12-emblem"><ScrollText className="w-6 h-6" /></div>
                  <div className="min-w-0">
                    <h3 className="v12-sheet-title leading-tight">יומן שאלות ותשובות</h3>
                    <p className="text-[11px] md:text-xs text-white/60 font-medium">
                      {unlocked ? `סך הכל ${logs.length} רשומות` : 'גישה לשופטים ראשיים בלבד'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="v12-sheet-x !static shrink-0"
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
                    <div className="relative w-full h-full rounded-[20px] bg-white/[0.14] flex items-center justify-center">
                      <Lock className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <h4 className="v12-sheet-title !text-xl mb-1">אזור מוגן</h4>
                  <p className="text-white/60 text-sm mb-5">הזינו קוד כדי לצפות ביומן</p>
                  <input
                    type="password"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    placeholder="קוד גישה"
                    className={`v12-field text-base text-center font-bold tracking-widest ${error ? '!shadow-[inset_0_0_0_2px_#FF6B70]' : ''}`}
                  />
                  {error && <p className="text-[#FFB3B6] text-xs font-bold mt-2">קוד שגוי, נסו שוב</p>}
                  <button
                    onClick={handleUnlock}
                    className="mt-4 w-full v12-btn v12-btn-primary"
                  >
                    כניסה ליומן
                  </button>
                </div>
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/10 shrink-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-white/50 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="חיפוש בשאלה, בתשובה או בעונה"
                          className="w-full pr-9 pl-9 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-base md:text-sm placeholder-white/40 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                        />
                        {search && (
                          <button
                            onClick={() => setSearch('')}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-white/5 text-white/60 hover:text-white flex items-center justify-center cursor-pointer"
                            aria-label="נקה חיפוש"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setSortNew((v) => !v)}
                        title={sortNew ? 'החדש ביותר למעלה' : 'הישן ביותר למעלה'}
                        className="shrink-0 h-[42px] px-3 rounded-xl bg-white/10 border border-white/10 text-white/80 hover:text-white hover:bg-white/[0.12] transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                      >
                        <ArrowDownWideNarrow className="w-4 h-4 text-[#9CCBFF]" />
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
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-white/60 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          איפוס
                        </button>
                      )}
                      <button
                        onClick={cleanOldLogs}
                        disabled={cleaning || logs.length === 0 || !canDelete}
                        title={canDelete ? undefined : 'ניקוי לבעלים בלבד'}
                        className="px-3 py-1.5 rounded-full text-xs font-bold text-white/60 hover:text-red-300 border border-white/10 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {cleaning ? 'מנקה' : confirmOld ? 'לחצו שוב למחיקת ישנות מ90 יום' : 'נקה ישנות מ90 יום'}
                      </button>
                      <span className="mr-auto text-[11px] text-white/50 font-medium">
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
                          names={userNames}
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
    </ModalScrim>
  );
}
