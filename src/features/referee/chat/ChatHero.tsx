/** Empty-chat start: an editorial greeting above a hairline index of starter
 *  questions. Nobody has spoken yet - the conversation begins only when the
 *  user asks or picks a line. Identity is typographic: mask-revealed
 *  greeting, numbered hairline list. No card grid, no glow halo, no map. */
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

type Props = {
  greeting: string;
  questions: string[];
  disabled: boolean;
  onQuestion: (question: string) => void;
  t: (key: string) => string;
};

const EASE = [0.22, 1, 0.36, 1] as const;

export default function ChatHero({ greeting, questions, disabled, onQuestion, t }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ duration: 0.3 }}
      className="relative min-h-[52vh] flex flex-col justify-center select-none py-4 md:py-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
        className="flex items-center gap-2.5 mb-4 md:mb-5"
      >
        <img src="/logoref.png" alt="" className="w-5 h-5 md:w-6 md:h-6 object-contain" draggable={false} />
        <span className="w-6 h-px bg-[#9fd8c6]/50" aria-hidden />
        <span className="text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-white/40">{t('chat.refereeTag')}</span>
      </motion.div>
      {greeting && (
        <h2 className="text-[2.4rem] md:text-[3.5rem] font-black tracking-[-0.02em] leading-[1.08] text-white/95">
          <span className="block overflow-hidden pb-1">
            <motion.span
              className="block"
              initial={{ y: '110%' }}
              animate={{ y: 0 }}
              transition={{ duration: 0.75, delay: 0.18, ease: EASE }}
            >
              {greeting}
            </motion.span>
          </span>
        </h2>
      )}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42, duration: 0.5, ease: EASE }}
        className="mt-3 md:mt-4 text-sm md:text-[15px] text-white/45 font-medium leading-relaxed max-w-md"
      >
        {t('intro.descFull')}
      </motion.p>
      <div className="mt-7 md:mt-9 w-full max-w-xl">
        {questions.map((question, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + index * 0.07, duration: 0.45, ease: EASE }}
            onClick={() => onQuestion(question)}
            disabled={disabled}
            className={`group w-full flex items-baseline gap-3 md:gap-4 py-3 md:py-3.5 border-t border-white/[0.07] hover:border-[#9fd8c6]/25 ${index === questions.length - 1 ? 'border-b' : ''} text-start cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-300`}
          >
            <span className="text-[11px] font-mono font-bold text-[#9fd8c6]/60 group-hover:text-[#9fd8c6] transition-colors duration-300 shrink-0">{String(index + 1).padStart(2, '0')}</span>
            <span className="flex-1 text-[14px] md:text-[15px] font-semibold text-white/70 group-hover:text-white transition-colors duration-300 leading-snug">{question}</span>
            <ArrowRight className="w-4 h-4 shrink-0 self-center text-[#9fd8c6] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 rtl:-scale-x-100 transition-all duration-300" aria-hidden />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
