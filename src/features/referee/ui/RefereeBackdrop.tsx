/** Static arena identity behind the working referee. No state or network work. */
import { motion } from 'framer-motion';
import { GRID_BG } from '../config';
import { MOTION } from './motion';

export function RefereeBackdrop() {
  return (
    <>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${GRID_BG}")`, backgroundSize: '56px 56px', backgroundRepeat: 'repeat' }} aria-hidden />
      <div className="absolute inset-0 bg-slate-950/[0.55]" aria-hidden />
      <img src="/logoref.png" alt="" aria-hidden draggable={false} loading="eager" decoding="async" className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[min(80vw,560px)] opacity-10 pointer-events-none select-none" style={{ maskImage: 'radial-gradient(circle, black 55%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 78%)' }} />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
      <div className="h-1 bg-gradient-to-l from-[#0B6BCB] via-[#FFC400] to-[#E1251B] w-full shrink-0 relative z-10" />
    </>
  );
}

type SeasonStatusProps = { learning: boolean; season: string; label: string; compact?: boolean };
export function SeasonStatus({ learning, season, label, compact = false }: SeasonStatusProps) {
  if (!learning && season === 'UNKNOWN') return null;
  const glow = learning ? 'bg-gradient-to-l from-amber-300/40 via-yellow-400/10 to-amber-300/40' : 'bg-gradient-to-l from-emerald-300/40 via-teal-400/10 to-cyan-300/40';
  const border = learning ? 'bg-gradient-to-l from-amber-300/80 via-yellow-200/30 to-amber-300/80' : 'bg-gradient-to-l from-emerald-300/80 via-teal-200/30 to-cyan-300/80';
  return (
    <motion.div layout transition={MOTION.control} className={`relative whitespace-nowrap ${compact ? '' : ''}`}>
      <div aria-hidden className={`absolute -inset-1 rounded-full blur-md ${glow}`} />
      <div className={`relative rounded-full p-px ${border}`}>
        <div className={`rounded-full bg-[#0B1526] ${compact ? 'px-2 py-px' : 'px-4 py-1.5'}`}>
          <span className={`${compact ? 'text-[10px]' : 'text-sm'} font-black text-slate-100 ${learning || compact ? '' : 'tracking-[0.18em]'}`} dir={compact ? undefined : 'ltr'}>{learning ? label : season}</span>
        </div>
      </div>
    </motion.div>
  );
}
