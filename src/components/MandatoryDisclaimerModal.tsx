/**
 * MandatoryDisclaimerModal — the gate, folded out of the intro system.
 *
 * WHAT: the same space as the intro (SpatialBackdrop), the same intact
 * logo. On entry, three hairline paths leave the logo's halo and FOLD
 * INWARD into a single coral node — the associations gathering into one
 * point of attention — and the disclaimer content settles beneath it.
 * Not a card dropped over the app: the intro's elements reorganized.
 *
 * HANDOFF (landing flow): the intro/login logo is still on screen when the
 * gate opens, so the gate grows out of IT — one continuous cinematic:
 *  1. The backdrop pushes in gently (camera drift).
 *  2. The logo flies from its exact last position into the gate, swelling
 *     as it travels, and lands in the fold cluster.
 *  3. The landing BLOOMS: the logo splits into shearing light slices,
 *     halo rings bloom outward, and forking branches grow out of the halo
 *     in every direction, tipping with coral buds.
 *  4. The branches dissolve into the cluster's own fold paths, the coral
 *     node ignites, and the copy stages in beneath — the tree settling
 *     into its final shape. No cut, no flash, one movement.
 *
 * COPY: all copy arrives translated via t(); direction follows isRTL.
 * The composition is horizontally symmetric, so RTL needs no mirroring.
 *
 * MOTION: the fold/bloom paths use pathLength=1 dash draws (no measuring);
 * reduced motion skips the flight and the bloom and lands directly on the
 * final state: logo, folded paths, node and content all present.
 *
 * EXIT: on confirm the page mounts a ParticleBurst above everything - the
 * gate's own elements dissolve into blue/red embers matching the chat
 * backdrop - while this stage plays its slow fade/slide exit over the live
 * chat underneath. Reduced motion confirms without the burst.
 */

import { useEffect, useRef, useState } from 'react';
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
  /**
   * Landing handoff mode: the intro/login logo is still on screen when the
   * gate opens. The gate grows out of that logo (flight -> bloom -> fold)
   * as one continuous organism. Without handoff the gate keeps its original
   * spring-pop entrance.
   */
  handoff?: boolean;
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

/** Two crown twigs: the branching crown the logo grows on landing. They are
 *  part of the final header geometry - they settle dimmed, never removed. */
const TWIG_PATHS = [
  'M 50 30 Q 40 20 34 12',
  'M 170 30 Q 180 20 186 12',
];

/** Draw order: 3 fold mains, then the 2 crown twigs (seconds, staggered). */
const FOLD_AT = [0.15, 0.28, 0.41, 0.30, 0.38];
/** Handoff timing: the branches grow out of the landed logo, overlapping the
 *  tail of the slice shear, and settle into the final header structure. */
const FOLD_AT_HANDOFF = [0.35, 0.47, 0.59, 0.52, 0.62];

const SLICE_COUNT = 6;

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function FoldCluster({ t, foldAt, nodeDelay, logoHidden, slicing, drawNow, budTravel, clusterRef }: {
  t: (key: string) => string;
  foldAt: readonly number[];
  nodeDelay: string;
  /** True while the flying logo still owns the visual (or slices do). */
  logoHidden: boolean;
  /** True during the shear: the slice stack plays over the hidden base logo. */
  slicing: boolean;
  /** Gate the WAAPI draws on the flight landing (handoff); immediate otherwise. */
  drawNow: boolean;
  /** Handoff: the coral bud rides the growing center line down into the node. */
  budTravel: boolean;
  clusterRef: React.RefObject<HTMLDivElement | null>;
}) {
  const lineRefs = useRef<(SVGPathElement | null)[]>([]);

  // Draw the folding paths once the flight has landed. Reduced motion lands
  // on the fully drawn state immediately.
  useEffect(() => {
    if (!drawNow) return;
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
        el.classList.remove('fold-grow');
        return;
      }
      el.style.strokeDashoffset = `${len}`;
      const anim = el.animate(
        [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: 480, delay: foldAt[i] * 1000, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      );
      // The SAME path element settles into its final quiet styling - no swap.
      anim.onfinish = () => el.classList.remove('fold-grow');
      anims.push(anim);
    });
    return () => anims.forEach(a => a.cancel());
  }, [foldAt, drawNow]);

  return (
    <div ref={clusterRef} className="intro-rise relative w-[220px] h-[170px] mx-auto" style={{ animationDelay: '0.05s' }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 220 170" aria-hidden>
        <ellipse className="gate-halo" cx="110" cy="62" rx="84" ry="46" fill="none" stroke="rgba(159,216,198,0.10)" strokeWidth="1" strokeDasharray="2 7" />
        {FOLD_PATHS.map((d, i) => (
          <path key={i} ref={el => { lineRefs.current[i] = el; }} className="assoc-line fold-grow" d={d} />
        ))}
        {TWIG_PATHS.map((d, i) => (
          <path key={`t${i}`} ref={el => { lineRefs.current[FOLD_PATHS.length + i] = el; }} className="assoc-twig fold-grow" d={d} />
        ))}
      </svg>

      {/* the landing flash: pure light, no geometry - the geometry that grows
          out of the logo IS the final header (halo, fold paths, twigs, bud) */}
      {slicing && (
        <div className="bloom-layer" aria-hidden>
          <div className="bloom-glow" />
        </div>
      )}

      {/* quiet halo glow behind the logo */}
      <div
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{
          left: 110, top: 62, width: 120, height: 120, transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(closest-side, rgba(143,214,194,0.12) 0%, rgba(255,122,102,0.05) 55%, transparent 78%)',
        }}
      />

      {/* the base logo (hidden while the flyer or the slices own the visual) */}
      <img
        src="/logoref.png"
        width="770" height="770"
        alt={t('app.title')}
        className="absolute object-contain select-none drop-shadow-[0_10px_28px_rgba(0,0,0,0.5)]"
        style={{ left: 110, top: 62, width: 64, height: 64, transform: 'translate(-50%, -50%)', opacity: logoHidden ? 0 : 1 }}
        draggable={false}
      />

      {/* the point the associations gather into */}
      <span
        aria-hidden
        className={`assoc-node absolute w-[6px] h-[6px] rounded-full${budTravel ? ' gate-bud' : ''}`}
        style={{ left: 110, top: 140, background: '#ff7a66', boxShadow: '0 0 10px rgba(255,122,102,0.7)', animationDelay: nodeDelay }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export default function MandatoryDisclaimerModal({ isOpen, onConfirm, t, handoff = false }: Props) {
  const { isRTL } = useLanguage();
  const reduce = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // -- the logo flight (handoff only) ----------------------------------------
  // The intro/login logo wrap is still mounted when the gate opens; measure
  // it, then fly the gate's own logo from that exact rect into the cluster.
  const clusterRef = useRef<HTMLDivElement | null>(null);
  const [flightFrom, setFlightFrom] = useState<DOMRect | null>(null);
  const [flightTo, setFlightTo] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [flightDone, setFlightDone] = useState(false);
  const [cut, setCut] = useState(false);
  const [landedDone, setLandedDone] = useState(false);
  const [glowDone, setGlowDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  useEffect(() => {
    if (!isOpen || !handoff || reduce) { setFlightFrom(null); setFlightTo(null); setFlightDone(false); setCut(false); setLandedDone(false); setGlowDone(false); return; }
    const el = document.querySelector('.assoc-logo-wrap');
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0) {
      setFlightFrom(r);
      setFlightTo(null);
      setFlightDone(false);
      setCut(false);
      setLandedDone(false);
      setGlowDone(false);
    } else {
      setFlightFrom(null);
      setFlightDone(true);
      setLandedDone(true);
      setGlowDone(true);
    }
  }, [isOpen, handoff, reduce]);

  useEffect(() => {
    if (!flightFrom || flightTo) return;
    const id = requestAnimationFrame(() => {
      const box = clusterRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) { setFlightDone(true); setLandedDone(true); setGlowDone(true); return; }
      const tx = box.left + (110 / 220) * box.width;
      const ty = box.top + (62 / 170) * box.height;
      const size = 64;
      setFlightTo({ x: tx - size / 2 - flightFrom.left, y: ty - size / 2 - flightFrom.top, scale: size / flightFrom.width });
    });
    return () => cancelAnimationFrame(id);
  }, [flightFrom, flightTo]);

  // The cut: the slice lines split the logo while it is still large.
  useEffect(() => {
    if (!flightFrom || flightDone) return;
    const t = setTimeout(() => setCut(true), 80);
    return () => clearTimeout(t);
  }, [flightFrom, flightDone]);

  const flying = Boolean(handoff && flightFrom && !landedDone);
  const slicing = Boolean(handoff && flightFrom && flightDone && !glowDone);
  // The gate's staged content waits until the small logo is visibly rebuilt;
  // only then do the same line elements grow into the header geometry.
  const landed = !handoff || !flightFrom || landedDone;

  const foldAt = handoff ? FOLD_AT_HANDOFF : FOLD_AT;
  const nodeDelay = handoff ? '0.47s' : '0.62s';
  const copyDelay = handoff
    ? { title: '1.15s', body: '1.27s', hint: '1.37s', confirm: '1.47s', credit: '1.57s' }
    : { title: '0.5s', body: '0.62s', hint: '0.72s', confirm: '0.82s', credit: '0.94s' };

  // No early return here on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation. Returning null would kill it instantly.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } }}
          className={`fixed inset-0 z-[10001]${landed ? '' : ' gate-wait'}`}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <div className={`absolute inset-0${handoff ? ' gate-camera' : ''}`}>
            <SpatialBackdrop />
          </div>
          <div className="absolute inset-0 bg-[#020408]/45" aria-hidden />

          <motion.div
            className="relative h-full overflow-y-auto"
            exit={{ y: 60, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] } }}
          >
            <motion.div
              initial={reduce ? false : handoff ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 24, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              transition={handoff ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] } : { type: 'spring', stiffness: 170, damping: 22, mass: 0.9 }}
              className="min-h-full flex flex-col items-center justify-center px-6 py-8 w-full max-w-md mx-auto"
              role="dialog"
              aria-modal="true"
            >
              <div data-burst>
                <FoldCluster
                  t={t}
                  foldAt={foldAt}
                  nodeDelay={nodeDelay}
                  logoHidden={flying}
                  slicing={slicing}
                  drawNow={landed}
                  budTravel={handoff}
                  clusterRef={clusterRef}
                />
              </div>

              <h3
                data-burst
                className="intro-rise text-xl md:text-2xl font-black text-white leading-tight tracking-tight text-center"
                style={{ animationDelay: copyDelay.title }}
              >
                {t('disclaimerPopup.title')}
              </h3>

              <div
                data-burst
                className="intro-rise mt-4 w-full text-start text-sm md:text-[15px] text-slate-200 leading-relaxed whitespace-pre-wrap rounded-2xl border border-white/[0.09] bg-white/[0.03] backdrop-blur-sm p-4"
                style={{ animationDelay: copyDelay.body }}
              >
                {t('disclaimerPopup.body')}
              </div>

              <p className="intro-rise text-[11px] text-white/35 mt-3 font-medium text-center" style={{ animationDelay: copyDelay.hint }}>
                {t('disclaimerPopup.hint')}
              </p>

              {/* confirm: the intro's hairline control, not a banner button */}
              <div className="intro-rise mt-4" style={{ animationDelay: copyDelay.confirm }} data-burst>
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

              <div className="intro-rise mt-3 flex items-center justify-center gap-1.5" style={{ animationDelay: copyDelay.credit }}>
                <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3.5 w-auto object-contain opacity-70" />
                <span className="text-[10px] font-bold text-white/30">{t('common.creditBuiltBy')}</span>
              </div>
            </motion.div>
          </motion.div>

          {/* the logo in flight: the slice lines cut it apart while it is
              still large, the pieces travel and shrink together, and the same
              edges reassemble it at the cluster - then the gate grows. */}
          {flying && flightFrom && (
            <motion.div
              className="fixed z-30 pointer-events-none"
              style={{
                left: flightFrom.left,
                top: flightFrom.top,
                width: flightFrom.width,
                height: flightFrom.height,
                transformOrigin: 'top left',
              }}
              initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
              animate={flightTo ? { x: flightTo.x, y: flightTo.y, scale: flightTo.scale } : {}}
              transition={{ type: 'spring', stiffness: 105, damping: 16, mass: 0.9 }}
              onAnimationComplete={() => {
                setFlightDone(true);
                // small now: the same slice edges reassemble the logo on the
                // ground, then the flyer hands over to the base logo.
                setCut(false);
                timersRef.current.push(setTimeout(() => setLandedDone(true), 300));
                timersRef.current.push(setTimeout(() => setGlowDone(true), 1000));
              }}
            >
              <motion.div
                className="relative w-full h-full drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                initial={{ scale: 1, rotate: 0 }}
                animate={flightTo ? { scale: [1, 1.22, 1], rotate: [0, -3, 0] } : {}}
                transition={{ duration: 0.75, times: [0, 0.5, 1], ease: [0.22, 1, 0.36, 1] }}
              >
                {Array.from({ length: SLICE_COUNT }, (_, i) => (
                  <img
                    key={i}
                    src="/logoref.png"
                    width="770" height="770"
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="flyer-slice absolute inset-0 w-full h-full object-contain select-none"
                    style={{
                      clipPath: `inset(${(i * 100) / SLICE_COUNT}% 0 ${((SLICE_COUNT - 1 - i) * 100) / SLICE_COUNT}% 0)`,
                      transform: `translateX(${cut ? (i % 2 === 0 ? 1 : -1) * (8 + i * 4) : 0}px)`,
                    }}
                  />
                ))}
              </motion.div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
