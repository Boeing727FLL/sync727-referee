/** Static arena identity behind the working referee. No state or network work. */
import { motion } from 'framer-motion';
import { Leaf } from 'lucide-react';
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
  // The season's own badge from the game mat: lime parallelogram, purple edge band,
  // leaf mark, black italic caps. Not a glass pill - the identity of this season.
  return (
    <motion.div layout transition={MOTION.control} className="flex items-center whitespace-nowrap select-none" dir="ltr">
      <div
        className={`relative flex items-center ${compact ? 'gap-1 ps-2 pe-2 py-[3px]' : 'gap-1.5 ps-3 pe-2.5 py-[5px]'} -skew-x-[10deg] rounded-[6px] border border-black/30 bg-gradient-to-br from-[#e4ef70] via-[#c6da4a] to-[#a2c034] ${learning ? 'animate-pulse' : ''}`}
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 3px 14px rgba(180,215,60,0.35)' }}
      >
        <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] rounded-s-[6px] bg-[#8a56c2]" />
        <Leaf className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} shrink-0 skew-x-[10deg] text-[#2d4a10]`} strokeWidth={2.6} />
        <span className={`${compact ? 'text-[9px]' : 'text-[10px] md:text-[11px]'} font-black italic uppercase tracking-[0.1em] leading-none skew-x-[10deg] text-[#131c06]`}>{learning ? label : season}</span>
      </div>
    </motion.div>
  );
}
