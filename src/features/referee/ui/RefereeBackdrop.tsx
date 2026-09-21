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
  // A node from the association language: small light, quiet text, no pill.
  return (
    <motion.div layout transition={MOTION.control} className="flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden
        className={`w-[5px] h-[5px] rounded-full ${learning ? 'bg-amber-300 animate-pulse' : 'bg-[#9fd8c6]'}`}
        style={{ boxShadow: learning ? '0 0 8px rgba(250,204,21,0.55)' : '0 0 8px rgba(159,216,198,0.5)' }}
      />
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold text-white/55 ${learning || compact ? '' : 'tracking-[0.18em]'}`} dir={compact ? undefined : 'ltr'}>{learning ? label : season}</span>
    </motion.div>
  );
}
