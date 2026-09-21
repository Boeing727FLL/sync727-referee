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

const FOLD_AT = [0.15, 0.28, 0.41]; // seconds, staggered
/** Handoff timing: the fold begins as the bloom dissolves (post-landing). */
const FOLD_AT_HANDOFF = [1.15, 1.27, 1.39];

/**
 * The bloom: forking branches that grow out of the landed logo's halo.
 * Coordinates live in a 420x260 overlay centered on the 220x170 cluster
 * (cluster offset = 100,45): logo center (210,107), halo rx 84 ry 46,
 * gate node (210,185). Mains + forks + buds at the tips.
 */
const BLOOM_BRANCHES: { d: string; fork?: boolean; at: number }[] = [
  { d: 'M 128.8 118.9 C 100 150, 84 176, 74 206', at: 0.10 },                    // left main
  { d: 'M 100.6 158.3 C 96 180, 106 202, 118 222', fork: true, at: 0.38 },       // left fork
  { d: 'M 88 188 C 80 200, 70 208, 58 216', fork: true, at: 0.50 },              // left sub-fork
  { d: 'M 291.2 118.9 C 320 150, 336 176, 346 206', at: 0.16 },                  // right main
  { d: 'M 319.4 158.3 C 324 180, 314 202, 302 222', fork: true, at: 0.44 },      // right fork
  { d: 'M 332 188 C 340 200, 350 208, 362 216', fork: true, at: 0.56 },          // right sub-fork
  { d: 'M 165.4 74.7 C 152 58, 140 46, 128 32', at: 0.24 },                      // top-left leaf
  { d: 'M 148 56 C 138 46, 128 40, 116 36', fork: true, at: 0.52 },              // top-left sub-leaf
  { d: 'M 254.6 74.7 C 268 58, 280 46, 292 32', at: 0.30 },                      // top-right leaf
  { d: 'M 272 56 C 282 46, 292 40, 304 36', fork: true, at: 0.58 },              // top-right sub-leaf
  { d: 'M 210 153 C 198 166, 222 176, 210 185', fork: true, at: 0.52 },          // trunk into the gate node
];
const BLOOM_BUDS: { x: number; y: number; at: number }[] = [
  { x: 74, y: 206, at: 0.72 }, { x: 118, y: 222, at: 0.88 }, { x: 58, y: 216, at: 1.02 },
  { x: 346, y: 206, at: 0.78 }, { x: 302, y: 222, at: 0.94 }, { x: 362, y: 216, at: 1.08 },
  { x: 128, y: 32, at: 0.76 }, { x: 116, y: 36, at: 1.00 },
  { x: 292, y: 32, at: 0.82 }, { x: 304, y: 36, at: 1.06 },
];

const SLICE_COUNT = 6;

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function FoldCluster({ t, foldAt, nodeDelay, logoHidden, slicing, drawNow, clusterRef }: {
  t: (key: string) => string;
  foldAt: readonly number[];
  nodeDelay: string;
  /** True while the flying logo still owns the visual (or slices do). */
  logoHidden: boolean;
  /** True during the shear: the slice stack plays over the hidden base logo. */
  slicing: boolean;
  /** Gate the WAAPI draws on the flight landing (handoff); immediate otherwise. */
  drawNow: boolean;
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
        return;
      }
      el.style.strokeDashoffset = `${len}`;
      anims.push(el.animate(
        [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
        { duration: 480, delay: foldAt[i] * 1000, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      ));
    });
    return () => anims.forEach(a => a.cancel());
  }, [foldAt, drawNow]);

  return (
    <div ref={clusterRef} className="intro-rise relative w-[220px] h-[170px] mx-auto" style={{ animationDelay: '0.05s' }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 220 170" aria-hidden>
        <ellipse cx="110" cy="62" rx="84" ry="46" fill="none" stroke="rgba(159,216,198,0.10)" strokeWidth="1" strokeDasharray="2 7" />
        {FOLD_PATHS.map((d, i) => (
          <path key={i} ref={el => { lineRefs.current[i] = el; }} className="assoc-line" d={d} />
        ))}
      </svg>

      {/* the bloom: rings, forking branches and buds growing out of the halo */}
      {slicing && (
        <div className="bloom-layer" aria-hidden>
          <div className="bloom-glow" />
          <div className="bloom-ring" style={{ ['--rd' as string]: '0.04s' }} />
          <div className="bloom-ring bloom-ring-b" style={{ ['--rd' as string]: '0.16s' }} />
          <div className="bloom-ring bloom-ring-c" style={{ ['--rd' as string]: '0.28s' }} />
          <svg className="bloom-svg" viewBox="0 0 420 260">
            {BLOOM_BRANCHES.map((b, i) => (
              <path
                key={i}
                className={`bloom-branch${b.fork ? ' bloom-fork' : ''}`}
                d={b.d}
                pathLength={1}
                style={{ ['--bd' as string]: `${b.at}s` }}
              />
            ))}
            {BLOOM_BUDS.map((b, i) => (
              <circle key={i} className="bloom-bud" cx={b.x} cy={b.y} r="3.4" style={{ ['--bd' as string]: `${b.at}s` }} />
            ))}
          </svg>
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
        style={{ left: 110, top: 62, width: 64, height: 64, transform: 'translate(-50%, -50%)', opacity: logoHidden ? 0 : 1, transition: 'opacity 0.22s ease' }}
        draggable={false}
      />

      {/* the shear: the logo splits into light slices, then snaps back */}
      {slicing && (
        <div aria-hidden className="absolute pointer-events-none" style={{ left: 110, top: 62, width: 64, height: 64, transform: 'translate(-50%, -50%)' }}>
          {Array.from({ length: SLICE_COUNT }, (_, i) => (
            <img
              key={i}
              src="/logoref.png"
              width="770" height="770"
              alt=""
              className="bloom-slice absolute inset-0 w-full h-full object-contain select-none"
              style={{
                clipPath: `inset(${(i * 100) / SLICE_COUNT}% 0 ${((SLICE_COUNT - 1 - i) * 100) / SLICE_COUNT}% 0)`,
                ['--shear' as string]: `${(i % 2 === 0 ? 1 : -1) * (6 + i * 2.5)}px`,
                ['--sd' as string]: `${i * 0.022}s`,
              }}
              draggable={false}
            />
          ))}
        </div>
      )}

      {/* the point the associations gather into */}
      <span
        aria-hidden
        className="assoc-node absolute w-[6px] h-[6px] rounded-full"
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
  const [sliceDone, setSliceDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  useEffect(() => {
    if (!isOpen || !handoff || reduce) { setFlightFrom(null); setFlightTo(null); setFlightDone(false); setSliceDone(false); return; }
    const el = document.querySelector('.assoc-logo-wrap');
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0) {
      setFlightFrom(r);
      setFlightTo(null);
      setFlightDone(false);
      setSliceDone(false);
    } else {
      setFlightFrom(null);
      setFlightDone(true);
      setSliceDone(true);
    }
  }, [isOpen, handoff, reduce]);

  useEffect(() => {
    if (!flightFrom || flightTo) return;
    const id = requestAnimationFrame(() => {
      const box = clusterRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) { setFlightDone(true); setSliceDone(true); return; }
      const tx = box.left + (110 / 220) * box.width;
      const ty = box.top + (62 / 170) * box.height;
      const size = 64;
      setFlightTo({ x: tx - size / 2 - flightFrom.left, y: ty - size / 2 - flightFrom.top, scale: size / flightFrom.width });
    });
    return () => cancelAnimationFrame(id);
  }, [flightFrom, flightTo]);

  const flying = Boolean(handoff && flightFrom && !flightDone);
  const slicing = Boolean(handoff && flightFrom && flightDone && !sliceDone);
  // The gate's staged content waits for the landing; the bloom runs on the
  // landing frame, the fold paths and copy settle behind it.
  const landed = !handoff || !flightFrom || flightDone;

  const foldAt = handoff ? FOLD_AT_HANDOFF : FOLD_AT;
  const nodeDelay = handoff ? '1.45s' : '0.62s';
  const copyDelay = handoff
    ? { title: '1.55s', body: '1.67s', hint: '1.77s', confirm: '1.87s', credit: '1.97s' }
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
                  logoHidden={flying || slicing}
                  slicing={slicing}
                  drawNow={landed}
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

          {/* the logo in flight: takes off from the intro/login logo's exact
              rect, swells as it travels, and lands in the fold cluster -
              which then blooms and grows the gate. */}
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
                timersRef.current.push(setTimeout(() => setSliceDone(true), 820));
              }}
            >
              <motion.img
                src="/logoref.png"
                width="770" height="770"
                alt=""
                aria-hidden
                draggable={false}
                className="w-full h-full object-contain select-none drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
                initial={{ scale: 1, rotate: 0 }}
                animate={flightTo ? { scale: [1, 1.35, 1], rotate: [0, -3, 0] } : {}}
                transition={{ duration: 0.75, times: [0, 0.5, 1], ease: [0.22, 1, 0.36, 1] }}
              />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
