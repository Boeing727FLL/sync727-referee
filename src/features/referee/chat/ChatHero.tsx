/** Empty-chat start: personal greeting above a 2x2 grid of suggestion cards
 *  in an Apple Liquid Glass material - translucent, specular-edged, each
 *  with a tinted icon tile. Nobody has spoken yet; the conversation begins
 *  only when the user asks or taps a card. */
import { motion } from 'framer-motion';
import { Bot, Cog, ListOrdered, Users } from 'lucide-react';

type Props = {
  greeting: string;
  questions: string[];
  disabled: boolean;
  onQuestion: (question: string) => void;
  t: (key: string) => string;
};

const ICONS = [ListOrdered, Bot, Cog, Users];
const TINTS = ['#9fd8c6', '#ff7a66', '#ffc400', '#5e9bff'];
const SPRING = { type: 'spring', stiffness: 240, damping: 22 } as const;

const CARD_MATERIAL =
  'rounded-[20px] bg-white/[0.07] backdrop-blur-xl backdrop-saturate-150 border border-white/[0.13] ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.35)]';

export default function ChatHero({ greeting, questions, disabled, onQuestion, t }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ duration: 0.3 }}
      className="relative min-h-[58vh] flex flex-col items-center justify-center text-center select-none py-6 md:py-8"
    >
      <motion.img
        src="/logoref.png"
        alt={t('app.title')}
        draggable={false}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...SPRING, delay: 0.08 }}
        className="w-12 h-12 md:w-14 md:h-14 object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
      />
      {greeting && (
        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.18 }}
          className="mt-4 md:mt-5 text-[2rem] md:text-[3rem] font-bold tracking-tight leading-[1.1] text-white/95"
          style={{ textWrap: 'balance' } as React.CSSProperties}
        >
          {greeting}
        </motion.h2>
      )}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.3 }}
        className="mt-3 md:mt-4 text-sm md:text-base text-white/50 font-medium leading-relaxed max-w-md"
      >
        {t('chat.heroDesc')}
      </motion.p>
      <div className="mt-8 md:mt-10 grid grid-cols-2 gap-2.5 md:gap-3 w-full max-w-xl md:max-w-2xl">
        {questions.map((question, index) => {
          const Icon = ICONS[index % ICONS.length];
          const tint = TINTS[index % TINTS.length];
          return (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileTap={{ scale: 0.96 }}
              transition={{ ...SPRING, delay: 0.4 + index * 0.07 }}
              onClick={() => onQuestion(question)}
              disabled={disabled}
              className={`${CARD_MATERIAL} group p-3.5 md:p-4 flex flex-col items-start gap-2.5 md:gap-3 text-start cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.11] hover:border-white/[0.22] transition-colors duration-300`}
            >
              <span
                className="w-8 h-8 md:w-9 md:h-9 rounded-[11px] flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                style={{ backgroundColor: `${tint}26`, color: tint }}
              >
                <Icon className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={2.2} />
              </span>
              <span className="text-[13px] md:text-sm font-semibold text-white/85 group-hover:text-white transition-colors duration-300 leading-snug">{question}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
