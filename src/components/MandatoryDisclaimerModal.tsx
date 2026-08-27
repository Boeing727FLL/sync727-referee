import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  t: (key: string) => string;
}

export default function MandatoryDisclaimerModal({ isOpen, onConfirm, t }: Props) {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10001] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, mass: 0.9 }}
            className="bg-slate-900 border-2 border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-6 md:p-7 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
