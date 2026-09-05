import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X, ArrowRight } from 'lucide-react';

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

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyModal({ isOpen, onClose }: Props) {
  // No early return on purpose: AnimatePresence needs the tree mounted
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
            className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Divine gold bloom on exit */}
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
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
                className="absolute top-4 left-4 p-2 rounded-xl bg-white/[0.06] text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-blue-300" />
                </div>
                <h3 className="text-xl md:text-2xl font-black text-white">מדיניות פרטיות</h3>
              </div>
              <div className="text-slate-200 text-right">
                <PrivacyContent />
              </div>
              <button
                onClick={onClose}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black py-3.5 px-6 rounded-xl transition-all shadow-[0_8px_20px_rgba(250,204,21,0.25)] hover:shadow-[0_12px_28px_rgba(250,204,21,0.35)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer text-base"
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
