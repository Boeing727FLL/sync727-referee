/** Empty-chat start: the starter questions appear as your own unsent first
 *  messages - quiet mint outline bubbles on your side of the thread, exactly
 *  where your first real bubble will land. Tapping one sends it and the
 *  drafts fold into the conversation. No greeting, no cards, no map. */
import { motion } from 'framer-motion';
import { CornerDownLeft } from 'lucide-react';
import { MOTION } from '../ui/motion';

type Props = {
  greeting: string;
  questions: string[];
  disabled: boolean;
  onQuestion: (question: string) => void;
  t: (key: string) => string;
};

export default function ChatHero({ questions, disabled, onQuestion }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      transition={MOTION.gentle}
      className="relative h-[54vh] min-h-[340px] max-h-[540px] select-none flex flex-col justify-start gap-2.5 md:gap-3 px-1 pt-4 md:pt-8"
    >
      {questions.map((question, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.18 + index * 0.13, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-row-reverse"
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onQuestion(question)}
            disabled={disabled}
            className="group flex items-center gap-2.5 max-w-[85%] md:max-w-[70%] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed rounded-[20px] border border-dashed border-[rgba(159,216,198,0.30)] hover:border-[rgba(159,216,198,0.65)] bg-[rgba(159,216,198,0.03)] hover:bg-[rgba(159,216,198,0.07)] px-3.5 py-2.5 md:px-4 md:py-3 transition-colors duration-300"
          >
            <span className="text-[14px] md:text-[15px] font-medium text-white/70 group-hover:text-white transition-colors duration-300 leading-snug text-start">{question}</span>
            <CornerDownLeft className="w-3.5 h-3.5 shrink-0 text-[#9fd8c6]/50 group-hover:text-[#9fd8c6] transition-colors duration-300" aria-hidden />
          </motion.button>
        </motion.div>
      ))}
    </motion.div>
  );
}
