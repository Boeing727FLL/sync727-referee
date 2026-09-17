/**
 * SettingsModal — the owner-only control room (floating window).
 *
 * WHAT: every owner capability in one hub — work mode (freeze the app for
 * everyone else), rulebook upload, judge corrections, analytics, feedback
 * viewer, destructive resets, privacy. Each row opens the dedicated tool;
 * this modal never implements tool logic itself, it only routes to it.
 *
 * ACCESS: the whole body gates on the owner account. Everyone else sees
 * the lock screen. Destructive rows (resets, work-mode ON) need a second
 * confirming tap within a few seconds.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Settings, Wrench, Upload, BarChart3, Database,
  MessageSquareHeart, RotateCcw, Shield, Lock, Check, ChevronLeft,
} from 'lucide-react';
import {
  subscribeMaintenance, setMaintenance, resetQuestions, resetFeedbackForAll,
} from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';

// ---------------------------------------------------------------------------
// Configuration constants (no magic numbers in logic or JSX below)
// ---------------------------------------------------------------------------

/** How long a second confirming tap stays armed. */
const CONFIRM_WINDOW_MS = 5000;

/** How long the feedback-timer confirmation message stays visible. */
const FB_MSG_MS = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpload: () => void;
  onOpenAnalytics: () => void;
  onOpenCorrections: () => void;
  onOpenFeedback: () => void;
  onOpenPrivacy: () => void;
}

/** Accent color of a row's icon chip. */
type RowTint = 'blue' | 'amber' | 'violet' | 'green' | 'red' | 'slate';

const TINT_CHIP: Record<RowTint, string> = {
  blue: 'bg-blue-500/15 border-blue-500/30 text-blue-300 shadow-[0_0_14px_rgba(59,130,246,0.25)]',
  amber: 'bg-amber-400/15 border-amber-400/30 text-amber-300 shadow-[0_0_14px_rgba(250,204,21,0.25)]',
  violet: 'bg-violet-500/15 border-violet-500/30 text-violet-300 shadow-[0_0_14px_rgba(139,92,246,0.25)]',
  green: 'bg-emerald-400/15 border-emerald-400/30 text-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.25)]',
  red: 'bg-red-500/15 border-red-500/30 text-red-300 shadow-[0_0_14px_rgba(239,68,68,0.25)]',
  slate: 'bg-white/[0.06] border-white/15 text-slate-300',
};

// ---------------------------------------------------------------------------
// Presentational pieces (no hooks, no logic — pure props in, JSX out)
// ---------------------------------------------------------------------------

/** Section header: small icon + gradient label + fading rule. */
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-1 pt-2 flex items-center gap-2 text-right">
      <span className="shrink-0 w-6 h-6 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-slate-400">
        {icon}
      </span>
      <span className="font-black text-xs bg-gradient-to-l from-slate-200 to-slate-400 bg-clip-text text-transparent">{children}</span>
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/15 to-transparent" aria-hidden />
    </div>
  );
}

/** One settings row: tinted icon chip, bold label + hint, hover chevron. */
function RowButton({ icon, tint = 'slate', label, sub, onClick, danger, nav }: {
  icon: React.ReactNode;
  tint?: RowTint;
  label: string;
  sub?: string;
  onClick: () => void;
  danger?: boolean;
  nav?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl font-bold text-sm transition-all text-right cursor-pointer group ${
        danger
          ? 'hover:bg-red-500/10 text-slate-200 hover:text-red-300'
          : 'hover:bg-white/[0.07] text-slate-200 hover:text-white'
      }`}
    >
      <span className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-105 ${TINT_CHIP[tint]}`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate leading-tight">{label}</span>
        {sub && <span className="block text-[11px] font-medium text-slate-500 truncate mt-0.5">{sub}</span>}
      </span>
      {nav && (
        <ChevronLeft className="w-4 h-4 shrink-0 text-slate-600 group-hover:text-slate-300 group-hover:-translate-x-0.5 transition-all" aria-hidden />
      )}
    </button>
  );
}

/** Owner lock screen for non-owner accounts. */
function LockGate() {
  return (
    <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute -inset-3 bg-yellow-400/15 blur-xl rounded-full" aria-hidden />
        <div className="relative w-full h-full rounded-full bg-slate-800 border border-yellow-400/25 flex items-center justify-center">
          <Lock className="w-6 h-6 text-yellow-300" />
        </div>
      </div>
      <h4 className="text-white font-black mb-1">אזור מוגן</h4>
      <p className="text-slate-400 text-sm">ההגדרות פתוחות לחשבון הבעלים בלבד.</p>
    </div>
  );
}

/**
 * Work-mode hero card: the crown jewel of this screen. Glows amber and
 * breathes while active; calm dark glass while off. Enabling locks every
 * other user out, so it demands a second confirming tap.
 */
function WorkModeCard({ active, toggling, confirming, errorMsg, onToggle }: {
  active: boolean;
  toggling: boolean;
  confirming: boolean;
  errorMsg: string | null;
  onToggle: () => void;
}) {
  return (
    <div className={`relative rounded-3xl border overflow-hidden transition-all duration-500 ${
      active
        ? 'border-amber-400/50 bg-gradient-to-b from-amber-400/[0.12] to-amber-400/[0.03] shadow-[0_0_36px_rgba(250,204,21,0.18)]'
        : 'border-white/10 bg-white/[0.03]'
    }`}>
      {active && (
        <motion.div
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-28 bg-amber-400/20 blur-3xl pointer-events-none"
          aria-hidden
        />
      )}
      <div className="relative flex items-center gap-3 px-4 py-4">
        <div className={`relative shrink-0 w-12 h-12 rounded-2xl border flex items-center justify-center ${
          active
            ? 'bg-gradient-to-b from-amber-300 to-amber-500 border-amber-300/60 shadow-[0_0_24px_rgba(250,204,21,0.45)]'
            : 'bg-amber-400/10 border-amber-400/25'
        }`}>
          <Wrench className={`w-5 h-5 ${active ? 'text-slate-950' : 'text-amber-300'}`} />
          {active && (
            <span className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-[15px] font-black text-white leading-tight flex items-center gap-2">
            מצב עבודה
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
              active ? 'bg-amber-400 text-slate-950' : 'bg-white/[0.07] text-slate-400 border border-white/10'
            }`}>
              {active ? 'פעיל' : 'כבוי'}
            </span>
          </p>
          <p className="text-[11px] font-medium text-slate-400 leading-snug mt-1">
            {active
              ? 'רק אתה רואה את האפליקציה. כולם מקבלים מסך עבודות.'
              : 'האפליקציה פתוחה לכולם כרגיל.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={active}
          aria-label="מצב עבודה"
          onClick={onToggle}
          disabled={toggling}
          className={`shrink-0 w-14 h-8 rounded-full p-1 flex items-center transition-all duration-300 cursor-pointer disabled:opacity-50 ${
            active
              ? 'bg-gradient-to-l from-amber-300 to-amber-500 justify-start shadow-[0_0_18px_rgba(250,204,21,0.5)]'
              : 'bg-slate-700 justify-end hover:bg-slate-600'
          }`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="w-6 h-6 rounded-full bg-white shadow shrink-0"
          />
        </button>
      </div>
      {confirming && !active && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onToggle}
          className="relative w-full px-3 py-2.5 text-[13px] font-black text-amber-200 bg-amber-400/10 border-t border-amber-400/30 hover:bg-amber-400/20 transition-colors cursor-pointer"
        >
          הפעלה מנתקת את כל המשתמשים. לחצו שוב לאישור.
        </motion.button>
      )}
      {errorMsg && (
        <p className="px-4 py-2.5 text-[11px] font-bold text-red-300 bg-red-500/10 border-t border-red-500/25">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The modal: hub of owner tools (routes out, implements nothing itself)
// ---------------------------------------------------------------------------

export default function SettingsModal({
  isOpen, onClose, onOpenUpload, onOpenAnalytics, onOpenCorrections, onOpenFeedback, onOpenPrivacy,
}: SettingsModalProps) {
  const [owner] = useState(() => isCurrentUserOwner());
  const [maintenance, setMaintenanceState] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmWorkMode, setConfirmWorkMode] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fbMsg, setFbMsg] = useState<string | null>(null);
  const [fbWorking, setFbWorking] = useState(false);

  // Fresh confirmations on every opening; maintenance stays live-subscribed.
  useEffect(() => {
    if (!isOpen) {
      setConfirmWorkMode(false);
      setConfirmReset(false);
      setFbMsg(null);
      setToggleError(null);
      return;
    }
    return subscribeMaintenance(setMaintenanceState);
  }, [isOpen]);

  /** Work-mode toggle: enabling needs a second tap (it locks everyone out). */
  const handleWorkModeToggle = async () => {
    if (toggling) return;
    if (!maintenance && !confirmWorkMode) {
      setConfirmWorkMode(true);
      setTimeout(() => setConfirmWorkMode(false), CONFIRM_WINDOW_MS);
      return;
    }
    setConfirmWorkMode(false);
    setToggleError(null);
    setToggling(true);
    try {
      await setMaintenance(!maintenance);
    } catch (e: any) {
      console.warn('setMaintenance failed:', e);
      const code = e?.code ? ` (${String(e.code)})` : '';
      setToggleError(`שמירת מצב העבודה נכשלה${code}. בדוק חיבור והתחברות כבעלים ונסה שוב.`);
    }
    setToggling(false);
  };

  /** Two-tap wipe of the question counters. */
  const handleResetQuestions = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), CONFIRM_WINDOW_MS);
      return;
    }
    setConfirmReset(false);
    setResetting(true);
    try {
      await resetQuestions();
    } catch (e) {
      console.warn('resetQuestions failed:', e);
    }
    setResetting(false);
  };

  /** Global feedback-timer reset (server flag every client obeys) + local keys. */
  const handleResetFeedbackTimer = async () => {
    if (fbWorking) return;
    setFbWorking(true);
    try {
      await resetFeedbackForAll();
      setFbMsg('טיימר הפידבק אופס לכולם.');
    } catch (e) {
      console.warn('resetFeedbackForAll failed:', e);
      setFbMsg('האיפוס נכשל. בדוק חיבור ונסה שוב.');
    }
    setFbWorking(false);
    setTimeout(() => setFbMsg(null), FB_MSG_MS);
  };

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
          className="fixed inset-0 z-[9600] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 md:p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-yellow-400/25 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_50px_rgba(250,204,21,0.08)]"
            role="dialog"
            aria-label="הגדרות"
          >
            {/* Header: glowing gear + title + close */}
            <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/10 bg-white/[0.03] shrink-0 relative overflow-hidden">
              <div className="absolute -top-14 left-1/2 -translate-x-1/2 w-72 h-28 bg-yellow-400/[0.08] rounded-full blur-3xl pointer-events-none" aria-hidden />
              <div className="relative flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="absolute -inset-1.5 bg-yellow-400/25 blur-lg rounded-xl pointer-events-none" aria-hidden />
                  <div className="relative w-10 h-10 rounded-xl bg-gradient-to-b from-yellow-400/25 to-yellow-400/10 border border-yellow-400/40 flex items-center justify-center shadow-[0_0_18px_rgba(250,204,21,0.25)]">
                    <Settings className="w-5 h-5 text-yellow-300" />
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <h3 className="text-lg font-black text-white leading-tight">הגדרות</h3>
                  <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" aria-hidden />
                    מרכז הבקרה, לבעלים בלבד
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="סגור"
                  className="shrink-0 p-2 rounded-full bg-white/[0.06] text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="h-[2px] shrink-0 bg-gradient-to-l from-transparent via-yellow-400/60 to-transparent" aria-hidden />

            <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4 space-y-3">
              {!owner ? (
                <LockGate />
              ) : (
                <>
                  <WorkModeCard
                    active={maintenance}
                    toggling={toggling}
                    confirming={confirmWorkMode}
                    errorMsg={toggleError}
                    onToggle={handleWorkModeToggle}
                  />

                  <div className="space-y-1">
                    <SectionTitle icon={<Database className="w-3.5 h-3.5" />}>חוברת ותוכן</SectionTitle>
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-xl">
                      <RowButton icon={<Upload className="w-4 h-4" />} tint="blue" label="העלאת חוברת חוקים" sub="קובץ חדש מחליף את החוברת הפעילה" onClick={onOpenUpload} nav />
                      <RowButton icon={<Wrench className="w-4 h-4" />} tint="amber" label="תיקוני שופט" sub="הנחיות שדורסות את החוברת" onClick={onOpenCorrections} nav />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <SectionTitle icon={<BarChart3 className="w-3.5 h-3.5" />}>נתונים</SectionTitle>
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-xl">
                      <RowButton icon={<BarChart3 className="w-4 h-4" />} tint="violet" label="אנליטיקס" sub="שאלות, משתמשים, מחוברים" onClick={onOpenAnalytics} nav />
                      <RowButton icon={<MessageSquareHeart className="w-4 h-4" />} tint="green" label="צפייה בפידבקים" sub="דירוגים והצעות שיפור" onClick={onOpenFeedback} nav />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <SectionTitle icon={<RotateCcw className="w-3.5 h-3.5" />}>איפוסים</SectionTitle>
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-xl">
                      <RowButton
                        icon={<RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />}
                        tint="red"
                        label={confirmReset ? 'לחצו שוב לאישור האיפוס' : resetting ? 'מאפס...' : 'איפוס ספירת השאלות'}
                        onClick={handleResetQuestions}
                        danger
                      />
                      <RowButton
                        icon={fbMsg ? <Check className="w-4 h-4" /> : <MessageSquareHeart className="w-4 h-4" />}
                        tint={fbMsg ? 'green' : 'slate'}
                        label={fbWorking ? 'מאפס...' : 'איפוס טיימר פידבק לכולם'}
                        sub={fbMsg || 'הטופס יקפוץ שוב אצל כולם'}
                        onClick={handleResetFeedbackTimer}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <SectionTitle icon={<Shield className="w-3.5 h-3.5" />}>כללי</SectionTitle>
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-xl">
                      <RowButton icon={<Shield className="w-4 h-4" />} tint="slate" label="מדיניות פרטיות" onClick={onOpenPrivacy} nav />
                    </div>
                  </div>

                  <div className="px-3 py-2 text-center">
                    <span className="text-[10px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
