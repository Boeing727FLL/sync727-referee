import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ArrowRight, Settings, Wrench, Upload, BarChart3, ScrollText,
  MessageSquareHeart, RotateCcw, Shield, Lock, Check,
} from 'lucide-react';
import {
  subscribeMaintenance, setMaintenance, resetQuestions, resetFeedbackForAll,
} from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpload: () => void;
  onOpenAnalytics: () => void;
  onOpenLogs: () => void;
  onOpenCorrections: () => void;
  onOpenFeedback: () => void;
  onOpenPrivacy: () => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pt-1 flex items-center gap-2 text-right">
      <span className="font-bold text-xs text-slate-500">{children}</span>
      <div className="flex-1 h-px bg-white/10" aria-hidden />
    </div>
  );
}

function RowButton({ icon, label, sub, onClick, danger }: {
  icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold text-sm transition-colors text-right cursor-pointer ${
        danger
          ? 'hover:bg-red-500/10 text-slate-700 hover:text-red-600'
          : 'hover:bg-white/70 text-slate-700 hover:text-slate-900'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {sub && <span className="block text-[11px] font-medium text-slate-500 truncate">{sub}</span>}
      </span>
    </button>
  );
}

export default function SettingsModal({
  isOpen, onClose, onOpenUpload, onOpenAnalytics, onOpenLogs, onOpenCorrections, onOpenFeedback, onOpenPrivacy,
}: SettingsModalProps) {
  const [owner] = useState(() => isCurrentUserOwner());
  const [maintenance, setMaintenanceState] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmWorkMode, setConfirmWorkMode] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fbMsg, setFbMsg] = useState<string | null>(null);
  const [fbWorking, setFbWorking] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmWorkMode(false);
      setConfirmReset(false);
      setFbMsg(null);
      return;
    }
    return subscribeMaintenance(setMaintenanceState);
  }, [isOpen]);

  const handleWorkModeToggle = async () => {
    if (toggling) return;
    if (!maintenance && !confirmWorkMode) {
      // Enabling locks everyone else out — require a second tap.
      setConfirmWorkMode(true);
      setTimeout(() => setConfirmWorkMode(false), 5000);
      return;
    }
    setConfirmWorkMode(false);
    setToggling(true);
    try {
      await setMaintenance(!maintenance);
    } catch (e) {
      console.warn('setMaintenance failed:', e);
    }
    setToggling(false);
  };

  const handleResetQuestions = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 5000);
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
    setTimeout(() => setFbMsg(null), 5000);
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
            className="w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            role="dialog"
            aria-label="הגדרות"
          >
            <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/10 bg-white/[0.03] shrink-0 flex items-center gap-3">
              <button
                onClick={onClose}
                aria-label="חזרה לצ׳אט"
                title="חזרה לצ׳אט"
                className="shrink-0 p-2 rounded-xl bg-white/[0.06] text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 rounded-xl bg-yellow-400/15 border border-yellow-400/25 flex items-center justify-center shrink-0">
                <Settings className="w-5 h-5 text-yellow-300" />
              </div>
              <div className="flex-1 min-w-0 text-right">
                <h3 className="text-base md:text-lg font-black text-white leading-tight">הגדרות</h3>
                <p className="text-[11px] text-slate-400 font-medium">לבעלים בלבד</p>
              </div>
              <button
                onClick={onClose}
                aria-label="סגור"
                className="shrink-0 p-2 rounded-xl bg-white/[0.06] text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {!owner ? (
                <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                    <Lock className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-400 text-sm">ההגדרות פתוחות לחשבון הבעלים בלבד.</p>
                </div>
              ) : (
                <>
                  <SectionTitle>מצב עבודה</SectionTitle>
                  <div className={`rounded-2xl border overflow-hidden transition-colors ${maintenance ? 'border-amber-400/40 bg-amber-400/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="flex items-center gap-3 px-3 py-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/25 flex items-center justify-center shrink-0">
                        <Wrench className="w-4 h-4 text-amber-300" />
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-black text-white leading-tight">מצב עבודה</p>
                        <p className="text-[11px] font-medium text-slate-400 leading-snug mt-0.5">
                          {maintenance
                            ? 'פעיל. רק אתה רואה את האפליקציה, כולם מקבלים מסך עבודות.'
                            : 'כבוי. האפליקציה פתוחה לכולם כרגיל.'}
                        </p>
                      </div>
                      <button
                        role="switch"
                        aria-checked={maintenance}
                        aria-label="מצב עבודה"
                        onClick={handleWorkModeToggle}
                        disabled={toggling}
                        className={`shrink-0 w-12 h-7 rounded-full p-1 flex items-center transition-colors cursor-pointer disabled:opacity-50 ${maintenance ? 'bg-amber-400 justify-start' : 'bg-slate-700 justify-end'}`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white shadow shrink-0" />
                      </button>
                    </div>
                    {confirmWorkMode && !maintenance && (
                      <button
                        onClick={handleWorkModeToggle}
                        className="w-full px-3 py-2.5 text-[13px] font-black text-amber-200 bg-amber-400/10 border-t border-amber-400/30 hover:bg-amber-400/20 transition-colors cursor-pointer"
                      >
                        הפעלה מנתקת את כל המשתמשים. לחצו שוב לאישור.
                      </button>
                    )}
                  </div>

                  <SectionTitle>חוברת ותוכן</SectionTitle>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                    <RowButton icon={<Upload className="w-4 h-4 text-slate-500" />} label="העלאת חוברת חוקים" sub="קובץ חדש מחליף את החוברת הפעילה" onClick={onOpenUpload} />
                    <RowButton icon={<Wrench className="w-4 h-4 text-slate-500" />} label="תיקוני שופט" sub="הנחיות שדורסות את החוברת" onClick={onOpenCorrections} />
                  </div>

                  <SectionTitle>נתונים</SectionTitle>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                    <RowButton icon={<BarChart3 className="w-4 h-4 text-slate-500" />} label="אנליטיקס" sub="שאלות, משתמשים, מחוברים" onClick={onOpenAnalytics} />
                    <RowButton icon={<ScrollText className="w-4 h-4 text-slate-500" />} label="יומן שופטים" sub="כל השאלות והתשובות" onClick={onOpenLogs} />
                    <RowButton icon={<MessageSquareHeart className="w-4 h-4 text-slate-500" />} label="צפייה בפידבקים" sub="דירוגים והצעות שיפור" onClick={onOpenFeedback} />
                  </div>

                  <SectionTitle>איפוסים</SectionTitle>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                    <RowButton
                      icon={<RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin text-slate-500' : 'text-slate-500'}`} />}
                      label={confirmReset ? 'לחצו שוב לאישור האיפוס' : resetting ? 'מאפס...' : 'איפוס ספירת השאלות'}
                      onClick={handleResetQuestions}
                      danger
                    />
                    <RowButton
                      icon={fbMsg ? <Check className="w-4 h-4 text-emerald-400" /> : <MessageSquareHeart className="w-4 h-4 text-slate-500" />}
                      label={fbWorking ? 'מאפס...' : 'איפוס טיימר פידבק לכולם'}
                      sub={fbMsg || 'הטופס יקפוץ שוב אצל כולם'}
                      onClick={handleResetFeedbackTimer}
                    />
                  </div>

                  <SectionTitle>כללי</SectionTitle>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                    <RowButton icon={<Shield className="w-4 h-4 text-slate-500" />} label="מדיניות פרטיות" onClick={onOpenPrivacy} />
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
