import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ImagePlus, Lightbulb, ShieldCheck, Users, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import type { TutorialDef } from '../lib/tutorials';

/**
 * TutorialModal — Apple-liquid-glass feature onboarding. Steps slide with
 * motion-blur (blur + y + scale spring); progress dots; the last step is
 * the T&C gate whose only exit is "accept". Closing early (X) skips
 * without completing, so the tutorial returns next time.
 */
const STEP_ICONS = {
  photo: ImagePlus,
  tips: Lightbulb,
  terms: ShieldCheck,
  team: Users,
} as const;

interface TutorialModalProps {
  tutorial: TutorialDef;
  onDone: () => void;
  onClose: () => void;
  onAction?: (action: 'open-team') => void;
}

export default function TutorialModal({ tutorial, onDone, onClose, onAction }: TutorialModalProps) {
  const { t, isRTL } = useLanguage();
  const [step, setStep] = useState(0);
  const total = tutorial.steps.length;
  const current = tutorial.steps[step];
  const last = step === total - 1;
  const Icon = STEP_ICONS[current.icon] ?? Lightbulb;
  const NextIcon = isRTL ? ArrowLeft : ArrowRight;
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.94, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(8px)' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-[24px] border border-white/20 bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_64px_rgba(0,0,0,0.55)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex gap-1.5" aria-hidden>
            {tutorial.steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-[#FFC400]' : i < step ? 'w-1.5 bg-white/60' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: isRTL ? -32 : 32, filter: 'blur(8px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: isRTL ? 32 : -32, filter: 'blur(8px)' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="flex flex-col items-center text-center"
            >
              <span className="w-14 h-14 rounded-2xl bg-[#FFC400]/15 border border-[#FFC400]/40 flex items-center justify-center shadow-[0_0_24px_rgba(250,204,21,0.25)]">
                <Icon className="w-7 h-7 text-[#FFC400]" />
              </span>
              <h3 className="text-lg font-black text-white mt-3">{t(current.titleKey)}</h3>
              {current.bodyKey && (
                <p className="text-sm text-slate-300 font-medium leading-relaxed mt-1.5 whitespace-pre-wrap">
                  {t(current.bodyKey)}
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-2 mt-5">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/10 text-slate-200 font-bold text-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <BackIcon className="w-4 h-4" />
                {t('tut.back')}
              </button>
            )}
            <button
              onClick={() => {
                if (current.ctaKey && current.ctaAction && onAction) onAction(current.ctaAction);
                else if (last) onDone();
                else setStep(s => s + 1);
              }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black text-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(250,204,21,0.3)]"
            >
              {current.ctaKey ? t(current.ctaKey) : last ? t('tut.accept') : t('tut.next')}
              {!last && !current.ctaKey && <NextIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
