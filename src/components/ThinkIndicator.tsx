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
  // Animated "thinking" caption (letter wave + bouncing dots) — never
  // static. The connecting phase (once per question) keeps its own caption.
  const isConnecting = current.orb === 'connecting';
  const thinkingBase = t('chat.thinking2').replace(/[.…]+$/u, '');
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
      <div className="grid w-full justify-items-center">
        <AnimatePresence initial={false}>
          {isConnecting ? (
            <motion.span
              key="label-connecting"
              className="col-start-1 row-start-1 text-xs font-bold text-slate-300 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
              {t('chat.phase_connecting')}
            </motion.span>
          ) : (
            <motion.span
              key="label-thinking"
              className="col-start-1 row-start-1 flex items-center gap-1.5 text-xs font-bold text-slate-300"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
              <span aria-hidden={false}>
                {thinkingBase.split('').map((ch, i) => (
                  <span
                    key={i}
                    className="thinking-letter"
                    style={{ animationDelay: `${i * 0.07}s` }}
                  >
                    {ch === ' ' ? '\u00A0' : ch}
                  </span>
                ))}
              </span>
              <span className="flex items-center gap-1" aria-hidden>
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
