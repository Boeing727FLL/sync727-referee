import { useLanguage } from '../hooks/useLanguage';
/**
 * JudgeCorrectionsModal — owner-only editor for referee overrides.
 *
 * WHAT: one text line = one correction the AI judge must obey above the
 * rulebook (stored as a single newline-joined doc). Saving also busts the
 * service-side cache so the very next question picks the new text up.
 *
 * ACCESS: decided by the signed-in account (owner only), no code gate.
 * Writes are additionally enforced by the Firestore rules.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { db } from '../lib/firebase/firestore';
import { invalidateCorrectionsCache } from '../services/geminiService';
import { isCurrentUserOwner } from '../lib/owner';
import { addCorrection, correctionCount, deleteCorrection, editCorrection, parseCorrections, serializeCorrections, visibleCorrections } from '../features/referee/corrections/model';
import { useModalA11y } from '../lib/modalA11y';

// ---------------------------------------------------------------------------
// Configuration constants (no magic numbers in logic or JSX below)
// ---------------------------------------------------------------------------

/** How long the green "saved" tick stays on the save button. */
const SAVED_TICK_MS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JudgeCorrectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Firestore location of the single corrections document. */
const correctionsDocRef = () => doc(db, 'app_config', 'corrections');

// ---------------------------------------------------------------------------
// Presentational pieces (no hooks, no logic — pure props in, JSX out)
// ---------------------------------------------------------------------------

/** Owner lock screen for non-owner accounts. */
function LockGate() {
  const { t } = useLanguage();
  return (
    <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute -inset-3 bg-blue-500/15 blur-xl rounded-full" aria-hidden />
        <div className="relative w-full h-full rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-blue-400" />
        </div>
      </div>
      <h4 className="text-white font-black mb-1">{t('owner.protected')}</h4>
      <p className="text-white/65 text-sm">{t('owner.correctionsOwner')}</p>
    </div>
  );
}

/** Spinner placeholder while the document loads. */
function LoadingView() {
  const { t } = useLanguage();
  return (
    <div className="m-auto px-6 py-10 text-center">
      <Loader2 className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-3" />
      <p className="text-white/65 text-sm font-bold">{t('owner.loadingCorrections')}</p>
    </div>
  );
}

/** Empty state when no correction lines exist (or match the search). */
function EmptyCorrections() {
  const { t } = useLanguage();
  return (
    <div className="text-center py-10">
      <p className="text-white/80 font-bold text-sm">{t('owner.emptyCorrections')}</p>
      <p className="text-white/55 text-xs mt-1">{t('owner.emptyCorrectionsSub')}</p>
    </div>
  );
}

/** Ghost toolbar button (reload / clear-all / add share this look). */
function ToolbarButton({ onClick, disabled, title, dangerHover, children }: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  dangerHover?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold transition-colors cursor-pointer disabled:opacity-40 ${
        dangerHover
          ? 'text-white/80 hover:text-red-300 hover:bg-red-500/10'
          : 'text-white/80 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

/** One editable correction row: number badge + textarea + delete. */
function CorrectionRow({ num, value, onChange, onDelete }: {
  num: number;
  value: string;
  onChange: (value: string) => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-[#092C65]/40 hover:border-white/15 px-3 py-2.5 transition-colors">
      <span className="shrink-0 w-6 h-6 mt-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-200 text-[11px] font-black flex items-center justify-center">
        {num}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={t('owner.writeCorrection')}
        className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#092C65]/70 border border-white/10 text-base md:text-sm text-white leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 resize-y transition-all"
        dir="auto"
      />
      <button
        onClick={onDelete}
        className="shrink-0 p-1.5 rounded-lg text-white/55 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
        title={t('owner.deleteLine')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The modal: gate -> load -> edit lines -> save (with cache invalidation)
// ---------------------------------------------------------------------------

export default function JudgeCorrectionsModal({ isOpen, onClose }: JudgeCorrectionsModalProps) {
  const { t, isRTL, language } = useLanguage();
  const a11yRef = useModalA11y(onClose);
  // -- gate + document state ----------------------------------------------------
  const [unlocked, setUnlocked] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [initialText, setInitialText] = useState('');

  // -- async flags -----------------------------------------------------------------
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The "saved" tick timer is tracked and cancelled on unmount.
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  // -- view state (search + new-line draft) -------------------------------------------
  const [search, setSearch] = useState('');
  const [newLine, setNewLine] = useState('');

  // Fresh gate + wiped draft on every opening.
  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setLines([]);
      setInitialText('');
      setSearch('');
      setNewLine('');
      setSaved(false);
      setUpdatedAt(null);
      setActionError(null);
      return;
    }
    // Access is decided by the signed-in account, no code anymore.
    setUnlocked(isCurrentUserOwner());
  }, [isOpen]);

  /** Load the doc into one-editable-line-per-row state. */
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(correctionsDocRef());
      const t = snap.exists() ? String(snap.data().text || '') : '';
      const u = snap.exists() ? Number(snap.data().updatedAt || 0) : 0;
      setLines(parseCorrections(t));
      setInitialText(t);
      setUpdatedAt(u || null);
      setActionError(null);
    } catch (e) {
      console.warn('corrections load failed:', e);
      setActionError(t('owner.loadFail'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlocked && isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  /**
   * Join lines back into the doc, stamp it, and bust the service cache so
   * the next question already obeys the new text.
   */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const now = Date.now();
      const t = serializeCorrections(lines);
      await setDoc(correctionsDocRef(), { text: t, updatedAt: now });
      invalidateCorrectionsCache();
      setInitialText(t);
      setUpdatedAt(now);
      setSaved(true);
      setActionError(null);
      savedTimerRef.current = setTimeout(() => setSaved(false), SAVED_TICK_MS);
    } catch (e) {
      console.warn('corrections save failed:', e);
      // The draft stays on screen; say the save did not land.
      setActionError(t('owner.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  const nonEmptyCount = useMemo(() => correctionCount(lines), [lines]);

  /** Search matches keep their ORIGINAL indices (delete/edit target them). */
  const visibleLines = useMemo(() => visibleCorrections(lines, search), [lines, search]);
  const deleteLine = (index: number) => setLines(previous => deleteCorrection(previous, index));
  const editLine = (index: number, value: string) => setLines(previous => editCorrection(previous, index, value));
  const addLine = () => {
    const next = addCorrection(lines, newLine);
    if (next !== lines) { setLines(next); setNewLine(''); }
  };

  /** Unsaved-changes flag drives the save button state and the footer hint. */
  const dirty = serializeCorrections(lines) !== initialText;

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
          className="fixed inset-0 z-[9999] v12-scrim v12-admin-scrim flex items-center justify-center modal-safe-3"
          dir={isRTL ? 'rtl' : 'ltr'}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="v12-sheet w-full max-w-2xl max-h-[90dvh] flex flex-col"
            ref={a11yRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            <div className="flex w-full h-1 shrink-0" aria-hidden>
              <div className="flex-1 bg-blue-600" />
              <div className="flex-1 bg-[#EEF3FA]" />
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
                      <div className="w-full h-full rounded-2xl bg-[#0B2F6E] flex items-center justify-center">
                        <Gavel className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-white leading-tight">{t('owner.correctionTitle')}</h3>
                    <p className="text-[11px] md:text-xs text-white/65 font-medium">
                      {unlocked ? t('owner.correctionCount').replace('{count}', String(nonEmptyCount)) : t('owner.correctionsRestricted')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.12] border border-white/10 text-white hover:bg-white/20 transition-colors flex items-center justify-center cursor-pointer"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {!unlocked ? (
                <LockGate />
              ) : loading ? (
                <LoadingView />
              ) : (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/5 shrink-0 space-y-3">
                    <p className="text-xs text-white/65 leading-relaxed">
                      {t('owner.correctionInfo')}
                    </p>
                    {actionError && (
                      <p className="text-[11px] font-bold text-red-300">{actionError}</p>
                    )}
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
                        {saved ? t('owner.saved') : t('owner.save')}
                      </button>
                      <ToolbarButton onClick={load} disabled={loading}>
                        <RotateCcw className="w-4 h-4" />
                        {t('owner.reload')}
                      </ToolbarButton>
                      <ToolbarButton onClick={() => setLines([])} disabled={lines.length === 0} dangerHover>
                        <Trash2 className="w-4 h-4" />
                        {t('owner.clearAll')}
                      </ToolbarButton>
                      <span className="ms-auto text-[11px] text-white/55 font-medium">
                        {t('owner.rows').replace('{count}', String(nonEmptyCount))}{updatedAt ? `, ${t('owner.updated').replace('{date}', new Date(updatedAt).toLocaleString(language, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}` : ''}
                        {dirty ? `, ${t('owner.unsaved')}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newLine}
                        onChange={(e) => setNewLine(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addLine()}
                        placeholder={t('owner.addCorrection')}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-[#092C65]/70 border border-white/10 text-white text-base md:text-sm placeholder-white/45 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                        dir="auto"
                      />
                      <ToolbarButton onClick={addLine} disabled={!newLine.trim()}>
                        <Plus className="w-4 h-4" />
                        {t('owner.add')}
                      </ToolbarButton>
                    </div>
                  </div>

                  <div className="px-4 md:px-5 pt-3 shrink-0">
                    <div className="relative">
                      <Search className="w-4 h-4 text-white/55 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('owner.search')}
                        className="w-full pr-9 pl-9 py-2.5 rounded-xl bg-[#092C65]/70 border border-white/10 text-white text-base md:text-sm placeholder-white/45 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                      />
                      {search && (
                        <button
                          onClick={() => setSearch('')}
                          className="absolute end-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-white/5 text-white/65 hover:text-white flex items-center justify-center cursor-pointer"
                          aria-label={t('owner.clearSearch')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="flex items-center gap-1.5 text-[11px] text-white/55 font-bold mt-2 mb-1 px-1">
                      <ListOrdered className="w-3.5 h-3.5" />
                      {t('owner.showing').replace('{shown}', String(visibleLines.length)).replace('{total}', String(nonEmptyCount))}
                    </p>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 pb-5 space-y-2">
                    {visibleLines.length === 0 ? (
                      <EmptyCorrections />
                    ) : (
                      visibleLines.map((o, n) => (
                        <CorrectionRow
                          key={o.index}
                          num={n + 1}
                          value={o.line}
                          onChange={(v) => editLine(o.index, v)}
                          onDelete={() => deleteLine(o.index)}
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
