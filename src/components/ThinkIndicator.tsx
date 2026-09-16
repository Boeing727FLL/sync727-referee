import { useEffect, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { useLanguage } from '../hooks/useLanguage';

/**
 * ThinkIndicator — the referee's thinking animation. Cycles through the
 * ruling phases on a timer (searching -> solving -> composing), swapping
 * both the orb animation and the label. Timer-driven, not content-driven:
 * the streamed thinking text doesn't reliably signal phase changes.
 */
const PHASES = [
  { orb: 'searching', labelKey: 'chat.phase_searching' },
  { orb: 'solving', labelKey: 'chat.phase_solving' },
  { orb: 'composing', labelKey: 'chat.phase_composing' },
] as const;

const PHASE_MS = 2500;

export default function ThinkIndicator() {
  const { t } = useLanguage();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % PHASES.length), PHASE_MS);
    return () => clearInterval(id);
  }, []);

  const current = PHASES[phase];
  return (
    <>
      <ThinkingOrb state={current.orb} size={64} theme="dark" />
      <span key={phase} className="text-xs font-bold text-slate-300">
        {t(current.labelKey)}
      </span>
    </>
  );
}
