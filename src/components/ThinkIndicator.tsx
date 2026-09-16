import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThinkingOrb } from 'thinking-orbs';
import type { OrbState } from 'thinking-orbs';
import { useLanguage } from '../hooks/useLanguage';
import { hasConnectedOnce } from '../lib/refereeConnection';

/**
 * ThinkIndicator — the referee's thinking animation. Cycles through six
 * ruling phases on a timer, crossfading both the orb animation and the
 * label (AnimatePresence over a shared grid cell, so the outgoing and
 * incoming visuals overlap instead of blinking). Timer-driven, not
 * content-driven: the streamed thinking text doesn't reliably signal
 * phase changes.
 */
const PHASES: { orb: OrbState; labelKey: string }[] = [
  { orb: 'connecting', labelKey: 'chat.phase_connecting' },
  { orb: 'searching', labelKey: 'chat.phase_searching' },
  { orb: 'working', labelKey: 'chat.phase_reviewing' },
  { orb: 'solving', labelKey: 'chat.phase_solving' },
  { orb: 'shaping', labelKey: 'chat.phase_verifying' },
  { orb: 'composing', labelKey: 'chat.phase_composing' },
];

const PHASE_MS = 2400;

export default function ThinkIndicator() {
  const { t } = useLanguage();
  // The connecting state shows only until the first successful answer —
  // afterwards the cycle runs the ruling states exactly.
  const [activePhases] = useState(() =>
    hasConnectedOnce() ? PHASES.filter(p => p.orb !== 'connecting') : PHASES
  );
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % activePhases.length), PHASE_MS);
    return () => clearInterval(id);
  }, [activePhases.length]);

  const current = activePhases[phase];
  return (
    <>
      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.div
            key={`orb-${phase}`}
            className="col-start-1 row-start-1"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.07 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            <ThinkingOrb state={current.orb} size={64} theme="dark" />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="grid w-full">
        <AnimatePresence initial={false}>
          <motion.span
            key={`label-${phase}`}
            className="col-start-1 row-start-1 text-xs font-bold text-slate-300 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            {t(current.labelKey)}
          </motion.span>
        </AnimatePresence>
      </div>
    </>
  );
}
