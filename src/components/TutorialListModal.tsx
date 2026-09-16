import { motion, AnimatePresence } from 'framer-motion';
import { X, GraduationCap, Check, Play } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { TUTORIALS, TUTORIAL_ORDER, isTutorialDone } from '../lib/tutorials';

/**
 * TutorialListModal — the tutorials "stay" here: replay any feature
 * tutorial on demand (opened from the user menu). Completed ones show
 * a check; watching again never un-completes them.
 */
interface TutorialListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWatch: (id: string) => void;
}

export default function TutorialListModal({ isOpen, onClose, onWatch }: TutorialListModalProps) {
  const { t, isRTL } = useLanguage();

  /** No early return on purpose: AnimatePresence needs the tree mounted
   * to play the exit animation. */
  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 16, scale: 0.96, filter: 'blur(8px)' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-[24px] border border-white/20 bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_64px_rgba(0,0,0,0.55)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-[#FFC400]" />
            <h3 className="text-base font-black text-white">{t('tut.menu')}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-1.5">
          {TUTORIAL_ORDER.filter(id => TUTORIALS[id]).map(id => {
            const done = isTutorialDone(id);
            return (
              <button
                key={id}
                onClick={() => onWatch(id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/[0.05] hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all active:scale-[0.99] cursor-pointer text-right"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-black text-white truncate">
                    {t(TUTORIALS[id].steps[0].titleKey)}
                  </span>
                  <span className="block text-[11px] text-slate-400 font-bold">
                    {t('tut.watch')}
                  </span>
                </span>
                {done ? (
                  <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-400/20 border border-emerald-300/40 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                  </span>
                ) : (
                  <span className="shrink-0 w-6 h-6 rounded-full bg-[#FFC400]/15 border border-[#FFC400]/40 flex items-center justify-center">
                    <Play className="w-3 h-3 text-[#FFC400]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
