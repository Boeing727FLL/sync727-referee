/** Static arena identity behind the working referee. No state or network work. */
import { motion } from 'framer-motion';
import { Atom, CircuitBoard, Cog, Compass, Droplet, Flame, Globe, Leaf, Mountain, Rocket, Shield, Star, Sun, Waves, Zap } from 'lucide-react';
import { NEUTRAL_IDENTITY, type SeasonIdentity } from '../season/identityModel';
import { GRID_BG } from '../config';
import { MOTION } from './motion';

export function RefereeBackdrop() {
  return (
    <>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `url("${GRID_BG}")`, backgroundSize: '56px 56px', backgroundRepeat: 'repeat' }} aria-hidden />
      <div className="absolute inset-0 bg-slate-950/[0.55]" aria-hidden />
      <img src="/logoref.webp" alt="" aria-hidden draggable={false} loading="eager" decoding="async" className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[min(80vw,560px)] opacity-10 pointer-events-none select-none" style={{ maskImage: 'radial-gradient(circle, black 55%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 78%)' }} />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
      <div className="h-1 bg-gradient-to-l from-[#0B6BCB] via-[#FFC400] to-[#E1251B] w-full shrink-0 relative z-10" />
    </>
  );
}

const MOTIF_ICONS = {
  atom: Atom, circuit: CircuitBoard, gear: Cog, compass: Compass, drop: Droplet,
  flame: Flame, globe: Globe, leaf: Leaf, mountain: Mountain, rocket: Rocket,
  shield: Shield, star: Star, sun: Sun, wave: Waves, bolt: Zap,
} as const;

type SeasonStatusProps = { learning: boolean; season: string; label: string; compact?: boolean; identity?: SeasonIdentity | null };
export function SeasonStatus({ learning, season, label, compact = false, identity }: SeasonStatusProps) {
  if (!learning && season === 'UNKNOWN') return null;
  // The season's own badge: palette, silhouette, and motif come from the
  // season's generated identity (seeded for BIOGLOW), never a glass pill.
  const badge = identity || NEUTRAL_IDENTITY;
  const Icon = MOTIF_ICONS[badge.motif] || Atom;
  const slanted = badge.style === 'parallelogram';
  const shape = slanted ? '-skew-x-[10deg] rounded-[6px]' : badge.style === 'pill' ? 'rounded-full' : 'rounded-[6px]';
  const unskew = slanted ? 'skew-x-[10deg]' : '';
  return (
    <motion.div layout transition={MOTION.control} className="flex items-center whitespace-nowrap select-none" dir="ltr">
      <div
        className={`relative flex items-center ${compact ? 'gap-1 ps-2 pe-2 py-[3px]' : 'gap-1.5 ps-3 pe-2.5 py-[5px]'} ${shape} border border-black/30 ${learning ? 'animate-pulse' : ''}`}
        style={{ background: `linear-gradient(135deg, ${badge.from}, ${badge.via} 50%, ${badge.to})`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.55), 0 3px 14px ${badge.glow}` }}
      >
        <span aria-hidden className="absolute inset-y-0 start-0 w-[3px]" style={{ backgroundColor: badge.edge, borderStartStartRadius: 'inherit', borderEndStartRadius: 'inherit' }} />
        <Icon className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} shrink-0 ${unskew}`} style={{ color: badge.iconInk }} strokeWidth={2.6} />
        <span className={`${compact ? 'text-[9px]' : 'text-[10px] md:text-[11px]'} font-black italic uppercase tracking-[0.1em] leading-none ${unskew}`} style={{ color: badge.ink }}>{learning ? label : badge.wordmark || season}</span>
      </div>
    </motion.div>
  );
}
