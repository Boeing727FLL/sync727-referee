/** Empty-chat start: a quiet Gemini-like greeting with soft suggestion cards.
 *  Nobody has spoken yet - the conversation begins only when the user asks. */
import { motion } from 'framer-motion';
import { MOTION } from '../ui/motion';

type Props = {
  greeting: string;
  questions: string[];
  disabled: boolean;
  onQuestion: (question: string) => void;
  t: (key: string) => string;
};

export default function ChatHero({ greeting, questions, disabled, onQuestion, t }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.gentle}
      className="flex flex-col items-center text-center max-w-xl mx-auto pt-8 md:pt-16"
    >
      <div className="relative">
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{ width: 120, height: 120, background: 'radial-gradient(closest-side, rgba(143,214,194,0.10) 0%, transparent 75%)' }}
        />
        <img src="/logoref.png" alt={t('app.title')} className="relative w-10 h-10 md:w-12 md:h-12 object-contain select-none opacity-95" draggable={false} />
      </div>
      {greeting && (
        <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mt-4 md:mt-5" style={{ textWrap: 'balance' } as React.CSSProperties}>
          {greeting}
        </h2>
      )}
      <p className="text-[13px] md:text-sm text-white/40 font-medium mt-2 md:mt-2.5 max-w-sm leading-relaxed px-2">{t('intro.descFull')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-7 md:mt-9 w-full">
        {questions.map((question, index) => (
          <motion.button
            key={index}
            whileTap={{ scale: 0.98 }}
            transition={MOTION.tap}
            onClick={() => onQuestion(question)}
            disabled={disabled}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 px-4 py-3.5 text-start text-[13px] md:text-sm font-bold text-white/70 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed leading-snug"
          >
            {question}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
