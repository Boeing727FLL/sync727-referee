import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  t: (key: string) => string;
}

export default function MandatoryDisclaimerModal({ isOpen, onConfirm, t }: Props) {
  // No early return here on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation. Returning null would kill it instantly.
  return (
    <AnimatePresence>
      {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 1.4, ease: [0.22, 1, 0.36, 1] } }}
            className="fixed inset-0 z-[10001] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
            dir="rtl"
          >
            <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -120 }}
            animate={{ scale: [0.95, 1.01, 1], opacity: [0, 1, 1], y: [-120, 8, 0], transition: { duration: 1.0, ease: [0.22, 1, 0.36, 1], times: [0, 0.7, 1] } }}
            exit={{ scale: [1, 0.99, 0.94], opacity: [1, 1, 0], y: [0, 45, 170], transition: { duration: 2.25, ease: [0.22, 1, 0.36, 1], times: [0, 0.7, 1] } }}
            className="bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-6 md:p-7 text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <motion.div
                  className="absolute -inset-3 bg-yellow-400/25 blur-xl rounded-full pointer-events-none"
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 0.9, 0.5], scale: [0.6, 1.2, 1] }}
                  transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], times: [0, 0.7, 1] }}
                />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 p-[2px] shadow-[0_4px_16px_rgba(250,204,21,0.4)]">
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                    <Check className="w-8 h-8 text-amber-600 stroke-[3]" />
                  </div>
                </div>
                <div className="absolute -inset-1 rounded-full border border-yellow-400/20 pointer-events-none" aria-hidden />
              </div>
              <h3 className="text-xl md:text-2xl font-black text-white mb-3 leading-tight">
                {t('disclaimerPopup.title')}
              </h3>
              <div className="text-sm md:text-[15px] text-slate-200 leading-relaxed whitespace-pre-wrap text-right bg-slate-950/40 rounded-xl p-4 border border-white/5">
                {t('disclaimerPopup.body')}
              </div>
              <p className="text-[11px] text-slate-400 mt-3 font-medium">
                יש לאשר כדי להמשיך
              </p>
              <button
                onClick={onConfirm}
                className="mt-4 w-full bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black py-3.5 md:py-4 px-6 rounded-xl transition-all shadow-[0_8px_20px_rgba(250,204,21,0.25)] hover:shadow-[0_12px_28px_rgba(250,204,21,0.35)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer text-base"
              >
                {t('disclaimerPopup.confirm')}
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
