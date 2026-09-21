/** Empty-chat hero and its four starter questions — in the intro's
 *  language: quiet logo with its halo, display type, hairline rows.
 *  No cards, no accent boxes, no glow pills. */
import { motion } from 'framer-motion';
import { MOTION } from '../ui/motion';
import { useLanguage } from '../../../hooks/useLanguage';

type Props = {
  greeting: string;
  questions: string[];
  disabled: boolean;
  onQuestion: (question: string) => void;
  t: (key: string) => string;
};

export default function ChatHero({ greeting, questions, disabled, onQuestion, t }: Props) {
  const { isRTL } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.gentle}
      className="relative flex flex-col items-center text-center max-w-2xl mx-auto pt-4 md:pt-10"
    >
      {/* the intact logo on its quiet halo, exactly the intro's mark */}
      <div className="relative mb-5 md:mb-7">
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{ width: 190, height: 190, background: 'radial-gradient(closest-side, rgba(143,214,194,0.10) 0%, rgba(255,122,102,0.045) 55%, transparent 78%)' }}
        />
        <img src="/logoref.png" alt={t('app.title')} className="relative w-16 h-16 md:w-20 md:h-20 object-contain select-none drop-shadow-[0_10px_28px_rgba(0,0,0,0.5)]" draggable={false} />
      </div>
      <p className="text-[10px] md:text-[11px] font-bold tracking-[0.34em] text-white/40 uppercase" dir="ltr">
        FIRST&nbsp;LEGO&nbsp;LEAGUE&nbsp;·&nbsp;VIRTUAL&nbsp;REFEREE
      </p>
      {greeting && <p className="text-sm font-bold text-white/55 mt-3">{greeting}</p>}
      <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mt-2" style={{ textWrap: 'balance' } as React.CSSProperties}>{t('intro.subtitle')}</h2>
      <p className="text-sm md:text-[15px] text-slate-400 font-medium mt-3 max-w-md leading-relaxed px-2" style={{ textWrap: 'pretty' } as React.CSSProperties}>{t('intro.descFull')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 mt-7 md:mt-9 w-full max-w-xl border-b border-white/[0.09]">
        {questions.map((question, index) => (
          <motion.button
            key={index}
            whileTap={{ scale: 0.99 }}
            transition={MOTION.tap}
            onClick={() => onQuestion(question)}
            disabled={disabled}
            className="group flex items-center justify-between gap-3 text-start border-t border-white/[0.09] px-1 py-3.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-[14px] md:text-[15px] font-bold text-white/80 leading-snug transition-colors group-hover:text-white">{question}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              className={`w-4 h-4 shrink-0 text-white/25 transition-all duration-300 group-hover:text-[#9fd8c6] group-hover:translate-x-0.5 ${isRTL ? 'rotate-180' : ''}`} aria-hidden>
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
