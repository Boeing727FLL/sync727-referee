/** Empty-chat opening: the referee speaks first, like an incoming message,
 *  and the starter questions sit beneath as tappable suggestion chips.
 *  Conversation-native: no hero, no display title, no list rows. */
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
      className="flex gap-2.5 md:gap-3"
    >
      <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full bg-white ring-1 ring-white/15 overflow-hidden flex items-center justify-center">
        <img src="/logoref.png" alt={t('app.title')} className="w-full h-full object-contain" draggable={false} />
      </div>
      <div className="min-w-0 max-w-[88%] md:max-w-[80%]">
        <p className="text-[10px] font-bold tracking-wide text-white/30 mb-1 px-0.5">{t('chat.refereeTag')}</p>
        <div className="text-[15px] md:text-[16px] leading-relaxed text-slate-100">
          {greeting && <p className="font-bold text-white mb-1">{greeting}</p>}
          <p className="text-slate-300">{t('intro.descFull')}</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-3.5">
          {questions.map((question, index) => (
            <motion.button
              key={index}
              whileTap={{ scale: 0.97 }}
              transition={MOTION.tap}
              onClick={() => onQuestion(question)}
              disabled={disabled}
              className="rounded-full border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/25 px-4 py-2 text-[13px] md:text-sm font-bold text-white/75 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-start"
            >
              {question}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
