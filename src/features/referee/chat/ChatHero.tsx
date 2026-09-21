/** Empty-chat start: the match sheet's letterhead. Greeting in ink, a quiet
 *  description, and the starter questions as docket lines with score-sheet
 *  checkboxes that fill on hover. Nobody has spoken yet - the conversation
 *  begins only when the user asks or picks a line. */
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
      className="relative flex flex-col justify-start select-none pt-6 md:pt-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
        className="flex items-center gap-2.5 mb-4 md:mb-5"
      >
        <img src="/logoref.png" alt="" className="w-5 h-5 md:w-6 md:h-6 object-contain" draggable={false} />
        <span className="w-6 h-px bg-[#1b2434]/30" aria-hidden />
        <span className="text-[10px] md:text-[11px] font-bold tracking-[0.22em] uppercase text-[#1b2434]/45">{t('chat.refereeTag')}</span>
      </motion.div>
      {greeting && (
        <h2 className="text-[2.4rem] md:text-[3.5rem] font-black tracking-[-0.02em] leading-[1.08] text-[#141d2e]">
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
        className="mt-3 md:mt-4 text-sm md:text-[15px] text-[#141d2e]/55 font-medium leading-relaxed max-w-md"
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
            className={`group w-full flex items-center gap-3 md:gap-4 py-3 md:py-3.5 border-t border-[#1b2434]/12 ${index === questions.length - 1 ? 'border-b' : ''} text-start cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(250,204,21,0.16)] transition-colors duration-200`}
          >
            <span className="w-3.5 h-3.5 shrink-0 rounded-[4px] border-[1.5px] border-[#1b2434]/35 group-hover:border-[#c2372f] group-hover:bg-[#c2372f] transition-colors duration-200" aria-hidden />
            <span className="flex-1 text-[14px] md:text-[15px] font-semibold text-[#1b2434]/75 group-hover:text-[#141d2e] transition-colors duration-200 leading-snug">{question}</span>
            <ArrowRight className="w-4 h-4 shrink-0 text-[#c2372f] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 rtl:-scale-x-100 transition-all duration-200" aria-hidden />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
