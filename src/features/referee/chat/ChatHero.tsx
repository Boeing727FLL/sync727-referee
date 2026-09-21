/** Empty-chat hero and its four starter questions. */
import { motion } from 'framer-motion';
import { MOTION } from '../ui/motion';
import { Cog, Hand, ListOrdered, Users } from 'lucide-react';
import { MISSION_ACCENTS } from '../config';

const ICONS = [ListOrdered, Hand, Cog, Users];

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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.gentle}
      className="relative flex flex-col items-center text-center max-w-2xl mx-auto"
    >
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-[#FFC400]/10 blur-3xl" />
      </div>
      <div className="relative mb-5">
        <div className="absolute inset-0 -m-2 rounded-full bg-[#FFC400]/[0.07] blur-xl" aria-hidden />
        <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-[24px] bg-white ring-1 ring-white/30 overflow-hidden shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
          <img src="/logoref.png" alt={t('app.title')} className="w-full h-full object-contain select-none" />
        </div>
      </div>
      <p className="text-[10px] md:text-[11px] font-black tracking-[0.45em] text-[#7FB8EC]" dir="ltr">
        FIRST&nbsp;LEGO&nbsp;LEAGUE&nbsp;·&nbsp;VIRTUAL&nbsp;REFEREE
      </p>
      {greeting && <p className="text-sm md:text-base font-bold text-amber-300/90 mt-3">{greeting}</p>}
      <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mt-2">{t('intro.subtitle')}</h2>
      <p className="text-sm md:text-base text-slate-300 font-medium mt-2 max-w-lg leading-relaxed px-2">{t('intro.descFull')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7 w-full">
        {questions.map((question, index) => {
          const Icon = ICONS[index % ICONS.length];
          const accent = MISSION_ACCENTS[index % MISSION_ACCENTS.length];
          return (
            <motion.button key={index} whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }} transition={MOTION.tap} onClick={() => onQuestion(question)} disabled={disabled} style={{ borderTopColor: accent }} className="group relative flex items-center gap-4 text-right px-5 py-4 rounded-2xl bg-[#0E2238] border border-t-[3px] border-x-white/10 border-b-white/10 hover:bg-[#142a47] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <span style={{ color: accent }} className="shrink-0 w-11 h-11 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center"><Icon className="w-6 h-6" /></span>
              <span className="text-[15px] md:text-base font-bold text-white leading-relaxed">{question}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
