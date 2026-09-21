/**
 * IntroScreen — the logo, its halo, its associations.
 *
 * WHAT: the full referee logo the team built sits intact at the center of a
 * deep-navy spatial canvas. A faint dashed halo orbits it; three short
 * thought-paths leave the logo's silhouette, bow outward along the halo and
 * resolve into coral nodes, each becoming one small card nestled beside the
 * logo. Logo, halo, paths and cards are one embraced system — not a tree
 * hanging beneath an icon.
 *
 * DESIGN LAW: extreme restraint, Apple-calm. The logo is never redrawn or
 * disassembled. Deep navy gradient, soft mint/coral light fields, a barely
 * visible hairline grid, generous negative space. One staged reveal, then
 * only a very slow drift.
 *
 * STRUCTURE: the SVG layer works in stage PIXELS (identity viewBox — some
 * browsers mis-render dash patterns under non-uniform preserveAspectRatio),
 * measured via ResizeObserver; path dashes are measured and drawn once with
 * WAAPI. Copy keys are locale-driven; do not hardcode strings here. Node
 * positions are logical and mirrored for RTL.
 */

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import SpatialBackdrop from './SpatialBackdrop';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntroScreenProps {
  isLoggedIn: boolean;
  onContinue: () => void;
  onWarm?: () => void;
  t: (key: string) => string;
}

// ---------------------------------------------------------------------------
// The association system
// ---------------------------------------------------------------------------

/**
 * The three associations, as angles on the halo (screen degrees: 0 = right,
 * 90 = down). Cards nestle in the lower hemisphere, close to the logo; the
 * top of the canvas stays pure negative space. Mirrored in RTL (theta ->
 * 180 - theta), which swaps the side cards.
 */
const ASSOCIATIONS = [
  { key: 'intro.feature1Title', node: 150, start: 130 },
  { key: 'intro.feature2Title', node: 90, start: 90 },
  { key: 'intro.feature3Title', node: 30, start: 50 },
] as const;

/** Reveal timeline (seconds): logo -> paths -> nodes -> cards -> entry. */
const T = {
  logo: 0.35,
  line: [1.15, 1.5, 1.85],
  node: [1.95, 2.3, 2.65],
  card: [2.05, 2.4, 2.75],
  entry: 3.1,
} as const;

const LOGO_CY = 0.42; // logo center, fraction of stage height

interface Halo {
  w: number; h: number;
  cx: number; cy: number;
  rx: number; ry: number;     // halo ellipse
  r0: number;                 // logo silhouette circle (paths start here)
}

function haloOf(w: number, h: number, logoPx: number): Halo {
  return {
    w, h,
    cx: w / 2,
    cy: h * LOGO_CY,
    rx: Math.min(w * 0.385, 230),
    ry: Math.min(h * 0.335, 165),
    r0: (logoPx / 2) * 1.42,
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const mirror = (deg: number) => (540 - deg) % 360;

function polar(h: Halo, deg: number, onHalo: boolean): [number, number] {
  if (onHalo) return [h.cx + h.rx * Math.cos(rad(deg)), h.cy + h.ry * Math.sin(rad(deg))];
  return [h.cx + h.r0 * Math.cos(rad(deg)), h.cy + h.r0 * Math.sin(rad(deg))];
}

/** A short path that leaves the logo silhouette and bows outward to its
 *  node on the halo — an embrace, not a spoke. */
function pathTo(h: Halo, startDeg: number, nodeDeg: number, isRTL: boolean): string {
  const s = isRTL ? mirror(startDeg) : startDeg;
  const n = isRTL ? mirror(nodeDeg) : nodeDeg;
  const [x0, y0] = polar(h, s, false);
  const [x2, y2] = polar(h, n, true);
  const mx = (x0 + x2) / 2, my = (y0 + y2) / 2;
  const dx = mx - h.cx, dy = my - h.cy;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (dx / len) * 18, cy = my + (dy / len) * 18;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

/** Minimal brand presence: plane mark + wordmark, no bar. */
function BrandMark() {
  return (
    <header className="intro-rise relative z-20 flex items-center justify-between px-5 md:px-8 py-5" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center gap-2.5">
        <img
          src="/boeing-plane.webp"
          width="160" height="160"
          alt="Boeing 727"
          className="h-6 md:h-7 w-auto object-contain opacity-90"
          draggable={false}
        />
        <span className="text-white/85 font-black tracking-tight text-base italic">
          Boeing <span className="text-primary not-italic">727</span>
        </span>
      </div>
    </header>
  );
}

/** The full team-built logo, intact, at the center of its halo. */
function CenterLogo({ t, logoPx }: { t: (key: string) => string; logoPx: number }) {
  return (
    <div className="absolute" style={{ left: '50%', top: `${LOGO_CY * 100}%`, transform: 'translate(-50%, -50%)' }}>
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: logoPx * 1.9, height: logoPx * 1.9,
          background: 'radial-gradient(closest-side, rgba(143,214,194,0.10) 0%, rgba(255,122,102,0.045) 55%, transparent 78%)',
        }}
      />
      <img
        src="/logoref.png"
        width="770" height="770"
        alt={t('app.title')}
        className="assoc-logo relative object-contain select-none drop-shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        style={{ width: logoPx, height: logoPx, animationDelay: `${T.logo}s, 1.6s` }}
        draggable={false}
      />
    </div>
  );
}

/** One association: a coral node on the halo and the card it becomes. */
function Association({ x, y, title, index }: { x: number; y: number; title: string; index: number }) {
  return (
    <>
      <span
        aria-hidden
        className="assoc-node absolute w-[5px] h-[5px] rounded-full"
        style={{
          left: x, top: y,
          background: '#ff7a66',
          boxShadow: '0 0 10px rgba(255,122,102,0.7)',
          animationDelay: `${T.node[index]}s`,
        }}
      />
      <div
        className="assoc-card assoc-card-top absolute"
        style={{ left: x, top: y, animationDelay: `${T.card[index]}s` }}
      >
        <div className="mt-2.5 rounded-xl border border-white/[0.09] bg-white/[0.035] backdrop-blur-sm px-3 py-2.5 w-[112px] md:w-[132px] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <span aria-hidden className="block w-3.5 h-px mb-1.5" style={{ background: 'rgba(159,216,198,0.7)' }} />
          <p className="text-[11px] md:text-[12px] font-bold text-white/90 leading-snug tracking-wide">{title}</p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export default function IntroScreen({ isLoggedIn, onContinue, onWarm, t }: IntroScreenProps) {
  const { isRTL } = useLanguage();
  const lineRefs = useRef<(SVGPathElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const logoPx = stageSize.w >= 768 ? 196 : 144;
  const halo = stageSize.w > 0 ? haloOf(stageSize.w, stageSize.h, logoPx) : null;

  // Track the stage box so the SVG can use an identity viewBox (1 unit =
  // 1px). Non-uniform preserveAspectRatio="none" spaces mis-render dash
  // patterns in some browsers, which clipped the side paths mid-draw.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) setStageSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw each thought-path once, staggered. Measured dashes, WAAPI-driven;
  // reduced motion lands directly on the fully drawn state.
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
        { duration: 1000, delay: T.line[i] * 1000, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' },
      ));
    });
    return () => anims.forEach(a => a.cancel());
  }, [isRTL, stageSize]);

  return (
    <div
      className="intro-screen fixed inset-0 z-[9999] flex flex-col overflow-hidden"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <SpatialBackdrop />
      <BrandMark />

      {/* the logo and its halo of associations */}
      <div ref={stageRef} className="relative z-10 flex-1 min-h-0">
        {halo && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${halo.w} ${halo.h}`}
            aria-hidden
          >
            {/* the halo itself: a whisper of an orbit */}
            <ellipse
              cx={halo.cx} cy={halo.cy} rx={halo.rx} ry={halo.ry}
              fill="none"
              stroke="rgba(159,216,198,0.08)"
              strokeWidth="1"
              strokeDasharray="2 7"
            />
            {ASSOCIATIONS.map((a, i) => (
              <path
                key={a.key}
                ref={el => { lineRefs.current[i] = el; }}
                className="assoc-line"
                d={pathTo(halo, a.start, a.node, isRTL)}
              />
            ))}
          </svg>
        )}

        <CenterLogo t={t} logoPx={logoPx} />

        {halo && ASSOCIATIONS.map((a, i) => {
          const deg = isRTL ? mirror(a.node) : a.node;
          const [x, y] = polar(halo, deg, true);
          return <Association key={a.key} x={x} y={y} index={i} title={t(a.key)} />;
        })}
      </div>

      {/* copy: anchored low, quiet, generous air above */}
      <main className="relative z-10 px-5 md:px-10 pb-7 md:pb-10 w-full max-w-3xl mx-auto md:mx-0">
        <span
          className="intro-rise block text-[10px] md:text-[11px] font-bold uppercase tracking-[0.34em] text-white/45 mb-3"
          style={{ animationDelay: '0.5s' }}
        >
          {t('intro.badge')}
        </span>

        <h2
          className="intro-rise text-[2.5rem] leading-[1.04] md:text-6xl font-black text-white tracking-tight"
          style={{ animationDelay: '0.7s', textWrap: 'balance' } as React.CSSProperties}
        >
          {t('intro.subtitle')}
        </h2>

        <p
          className="intro-rise text-slate-400 text-[14px] md:text-[16px] font-medium leading-6 md:leading-7 mt-3 max-w-md"
          style={{ animationDelay: '0.85s', textWrap: 'pretty' } as React.CSSProperties}
        >
          {t('intro.descFull')}
        </p>

        {/* entry: hairline control, not a banner button */}
        <div className="intro-rise mt-6" style={{ animationDelay: `${T.entry}s` }}>
          <button
            onClick={onContinue}
            onPointerEnter={onWarm}
            onFocus={onWarm}
            onTouchStart={onWarm}
            className="group flex items-center gap-3 cursor-pointer py-2"
          >
            <span className="text-[15px] md:text-base font-black text-white tracking-tight border-b border-yellow-400/60 pb-1 transition-colors group-hover:border-yellow-300">
              {isLoggedIn ? t('intro.continue') : t('intro.continueLogin')}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              className={`w-4 h-4 text-yellow-300 transition-transform duration-300 group-hover:translate-x-0.5 ${isRTL ? 'rotate-180' : ''}`} aria-hidden>
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
          <p className="mt-4 text-[10px] text-white/35 font-medium tracking-wide">
            {t('intro.notOfficial')}
            {' · '}
            <a href="/privacy" className="underline underline-offset-2 hover:text-white/60 transition-colors">
              {t('common.privacy')}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
