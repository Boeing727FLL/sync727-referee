import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThinkingOrb } from 'thinking-orbs';
import type { OrbState } from 'thinking-orbs';
import { useLanguage } from '../hooks/useLanguage';
import { claimConnectingPhase } from '../lib/thinkCycle';

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
  // The connecting state is claimed by the first indicator of a request —
  // later mounts for the same answer skip it, so it shows exactly once
  // per answer and the cycle then runs the ruling states.
  const [activePhases] = useState(() =>
    claimConnectingPhase() ? PHASES : PHASES.filter(p => p.orb !== 'connecting')
  );
  const [phase, setPhase] = useState(0);
  // After the first pass, wrap to index 1 (not 0): the connecting phase is
  // shown once when the question is sent and never loops back until the
  // next question (which remounts with a fresh cycle).
  const wrapTo = activePhases[0].orb === 'connecting' ? 1 : 0;

  useEffect(() => {
    const id = setInterval(
      () => setPhase(p => (p + 1 >= activePhases.length ? wrapTo : p + 1)),
      PHASE_MS
    );
    return () => clearInterval(id);
  }, [activePhases.length, wrapTo]);

  const current = activePhases[phase];
  // The label is always plain "thinking" — only the connecting phase keeps
  // its own caption. The orb animations still cycle through all states.
  const label = current.orb === 'connecting' ? t('chat.phase_connecting') : t('chat.thinking2');
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
            key={current.orb === 'connecting' ? 'label-connecting' : 'label-thinking'}
            className="col-start-1 row-start-1 text-xs font-bold text-slate-300 text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>
    </>
  );
}
