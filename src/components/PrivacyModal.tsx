/**
 * PrivacyModal — privacy policy as a floating window over the live chat.
 *
 * WHAT: the shared PrivacyContent (also used by the /privacy route) plus
 * a gold "back to chat" button. Closing plays the signature 2-second
 * divine exit (panel rises with blur while a gold bloom breathes) that
 * reveals the chat underneath — timings below are product behavior,
 * never "cleaned up".
 *
 * COPY: PrivacyContent wording is shared and deliberately untouched here.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X, ArrowRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared policy copy (single source for the modal AND the /privacy route)
// ---------------------------------------------------------------------------

export function PrivacyContent() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p>
        שופט הזירה הווירטואלי שומר רק את המידע שצריך כדי שהשירות יעבוד.
        בהרשמה נשמרים השם וכתובת האימייל.
        השאלות והתשובות נשמרות ביומן פנימי כדי לבדוק איכות,
        והמשובים נשמרים כדי לשפר את השירות.
      </p>
      <p>
        רשומות ישנות נמחקות אוטומטית אחרי 90 יום.
        אנחנו לא מוכרים מידע ולא מעבירים אותו לאף אחד.
      </p>
      <p>
        אפשר למחוק את החשבון בכל רגע מתוך האפליקציה,
        עם כפתור מחיקת חשבון בתפריט המשתמש.
        המחיקה מסירה את החשבון לצמיתות.
      </p>
      <p>
        לשאלות על פרטיות אפשר לכתוב ל boeing727.il@gmail.com.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

export default function PrivacyModal({ isOpen, onClose }: Props) {
  // No early return here on purpose: AnimatePresence needs the tree mounted
  // to play the 2s divine exit animation. Returning null would kill it instantly.
  return (
    <AnimatePresence>
      {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 1.4, ease: [0.22, 1, 0.36, 1] } }}
            className="fixed inset-0 z-[9000] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
            dir="rtl"
          >
            <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ scale: 1.07, opacity: 0, y: -70, filter: 'blur(14px)', transition: { duration: 2, ease: [0.22, 1, 0.36, 1] } }}
            transition={
              { duration: 2.25, ease: [0.22, 1, 0.36, 1], times: [0, 0.7, 1] } as any
            }
            className="relative bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] w-full max-w-md overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Divine gold bloom on exit */}
            <motion.div
              className="absolute inset-0 rounded-[24px] pointer-events-none"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: [0, 0.55, 0], scale: [1, 1.12, 1.25], transition: { duration: 2, ease: [0.22, 1, 0.36, 1] } }}
              style={{ boxShadow: '0 0 90px 30px rgba(250,204,21,0.35), inset 0 0 60px rgba(250,204,21,0.12)' }}
            />
            <div className="p-6 md:p-7 relative">
              <button
                onClick={onClose}
                aria-label="סגור"
                className="absolute top-4 left-4 p-2 rounded-full bg-white/[0.06] text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3 mb-5">
                <div className="relative shrink-0">
                  <div className="absolute -inset-1.5 bg-blue-500/20 blur-lg rounded-2xl pointer-events-none" aria-hidden />
                  <div className="relative w-11 h-11 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-blue-300" />
                  </div>
                </div>
                <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">מדיניות פרטיות</h3>
              </div>
              <div className="text-slate-200 text-right">
                <PrivacyContent />
              </div>
              <button
                onClick={onClose}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black py-3.5 md:py-4 px-6 rounded-2xl transition-all shadow-[0_8px_20px_rgba(250,204,21,0.25)] hover:shadow-[0_12px_28px_rgba(250,204,21,0.35)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer text-base"
              >
                <ArrowRight className="w-4 h-4" />
                חזרה לצ׳אט
              </button>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3.5 w-auto object-contain opacity-70" />
                <span className="text-[10px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
