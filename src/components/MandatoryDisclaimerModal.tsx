/**
 * MandatoryDisclaimerModal — the gate, folded out of the intro system.
 *
 * WHAT: the same space as the intro (SpatialBackdrop), the same intact
 * logo. On entry, three hairline paths leave the logo's halo and FOLD
 * INWARD into a single coral node — the associations gathering into one
 * point of attention — and the disclaimer content settles beneath it.
 * Not a card dropped over the app: the intro's elements reorganized.
 *
 * COPY: all copy arrives translated via t(); direction follows isRTL.
 * The composition is horizontally symmetric, so RTL needs no mirroring.
 *
 * MOTION: paths are measured (getTotalLength) and drawn once with WAAPI;
 * every other beat is a staged CSS rise. Reduced motion lands directly on
 * the final state: logo, folded paths, node and content all present.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import SpatialBackdrop from './SpatialBackdrop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  t: (key: string) => string;
}

// ---------------------------------------------------------------------------
// The fold: three halo paths gathering into one node (fixed 220x170 space)
// ---------------------------------------------------------------------------

/** Halo ellipse: cx 110, cy 62, rx 84, ry 46. Paths start on the halo at
 *  150 / 90 / 30 degrees and converge on the node at (110, 140). */
const FOLD_PATHS = [
  'M 37.3 85 Q 63 127 110 140',
  'M 110 108 Q 110 126 110 140',
  'M 182.7 85 Q 157 127 110 140',
];

const FOLD_AT = [0.55, 0.75, 0.95]; // seconds, staggered

function FoldCluster({ t }: { t: (key: string) => string }) {
  const lineRefs = useRef<(SVGPathElement | null)[]>([]);

  // Draw the folding paths once when the gate opens. Reduced motion lands
  // on the fully drawn state immediately.
  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anims: Animation[] = [];
    lineRefs.current.forEach((el, i) => {
      if (!el) return;
      const len = el.getTotalLength();
      el.style.strokeDasharray = `${len}`;
      if (reduce) {
        el.style.strokeDashoffset = '0';
        return;
      }
      el.style.strokeDashoffset = `${len}`;
      anims.push(el.animate(
        [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: 700, delay: FOLD_AT[i] * 1000, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      ));
    });
    return () => anims.forEach(a => a.cancel());
  }, []);

  return (
    <div className="intro-rise relative w-[220px] h-[170px] mx-auto" style={{ animationDelay: '0.15s' }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 220 170" aria-hidden>
        <ellipse cx="110" cy="62" rx="84" ry="46" fill="none" stroke="rgba(159,216,198,0.10)" strokeWidth="1" strokeDasharray="2 7" />
        {FOLD_PATHS.map((d, i) => (
          <path key={i} ref={el => { lineRefs.current[i] = el; }} className="assoc-line" d={d} />
        ))}
      </svg>
      {/* quiet halo glow behind the logo */}
      <div
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{
          left: 110, top: 62, width: 120, height: 120, transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(closest-side, rgba(143,214,194,0.12) 0%, rgba(255,122,102,0.05) 55%, transparent 78%)',
        }}
      />
      <img
        src="/logoref.png"
        width="770" height="770"
        alt={t('app.title')}
        className="absolute object-contain select-none drop-shadow-[0_10px_28px_rgba(0,0,0,0.5)]"
        style={{ left: 110, top: 62, width: 64, height: 64, transform: 'translate(-50%, -50%)' }}
        draggable={false}
      />
      {/* the point the associations gather into */}
      <span
        aria-hidden
        className="assoc-node absolute w-[6px] h-[6px] rounded-full"
        style={{ left: 110, top: 140, background: '#ff7a66', boxShadow: '0 0 10px rgba(255,122,102,0.7)', animationDelay: '1.3s' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export default function MandatoryDisclaimerModal({ isOpen, onConfirm, t }: Props) {
  const { isRTL } = useLanguage();
  // No early return here on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation. Returning null would kill it instantly.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } }}
          className="fixed inset-0 z-[10001]"
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <SpatialBackdrop />
          <div className="absolute inset-0 bg-[#020408]/45" aria-hidden />

          <motion.div
            className="relative h-full overflow-y-auto"
            exit={{ y: 60, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } }}
          >
            <div
              className="min-h-full flex flex-col items-center justify-center px-6 py-8 w-full max-w-md mx-auto"
              role="dialog"
              aria-modal="true"
            >
              <FoldCluster t={t} />

              <h3
                className="intro-rise text-xl md:text-2xl font-black text-white leading-tight tracking-tight text-center"
                style={{ animationDelay: '1.25s' }}
              >
                {t('disclaimerPopup.title')}
              </h3>

              <div
                className="intro-rise mt-4 w-full text-start text-sm md:text-[15px] text-slate-200 leading-relaxed whitespace-pre-wrap rounded-2xl border border-white/[0.09] bg-white/[0.03] backdrop-blur-sm p-4"
                style={{ animationDelay: '1.4s' }}
              >
                {t('disclaimerPopup.body')}
              </div>

              <p className="intro-rise text-[11px] text-white/35 mt-3 font-medium text-center" style={{ animationDelay: '1.5s' }}>
                {t('disclaimerPopup.hint')}
              </p>

              {/* confirm: the intro's hairline control, not a banner button */}
              <div className="intro-rise mt-4" style={{ animationDelay: '1.6s' }}>
                <button
                  onClick={onConfirm}
                  className="group flex items-center gap-2.5 cursor-pointer py-2"
                >
                  <Check className="w-4 h-4 text-yellow-300 stroke-[2.5] transition-transform duration-300 group-hover:scale-110" aria-hidden />
                  <span className="text-[15px] md:text-base font-black text-white tracking-tight border-b border-yellow-400/60 pb-1 transition-colors group-hover:border-yellow-300">
                    {t('disclaimerPopup.confirm')}
                  </span>
                </button>
              </div>

              <div className="intro-rise mt-3 flex items-center justify-center gap-1.5" style={{ animationDelay: '1.75s' }}>
                <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3.5 w-auto object-contain opacity-70" />
                <span className="text-[10px] font-bold text-white/30">{t('common.creditBuiltBy')}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
