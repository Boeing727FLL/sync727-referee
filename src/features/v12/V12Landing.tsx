/**
 * V12Landing - the whole pre-chat surface from the approved v12 video:
 * an FLL robot drives in on FIRST-colored tire tracks and reveals the logo,
 * the logo rises and one glass card takes over with a diagonal split panel
 * that sweeps between sign-in, sign-up and the mandatory disclaimer, while
 * the referee character reacts (covers his eyes on the password, cheers on
 * confirm) and is then carried into the chat greeting.
 *
 * No Firebase here: the auth form is a lazy chunk (warmed during the intro).
 */
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Referee, { type RefereePose } from './Referee';
import { useLanguage } from '../../hooks/useLanguage';

const authFormImport = () => import('./V12AuthForm');
const V12AuthForm = lazy(authFormImport);

export type PanelPos = 'top' | 'bottom';
export type BuddyApi = {
  cover: (on: boolean) => void;
  look: (pt: { x: number; y: number } | null) => void;
  say: (text: string, ms?: number) => void;
  no: () => void;
};
export type SweepFn = (to: PanelPos, midpoint: () => void) => void;

type Props = {
  signedIn: boolean;
  /** 'login' starts directly on the card (deep link / kicked session). */
  start?: 'intro' | 'login';
  onWarm?: () => void;
  /** Fresh login succeeded: the chat can start mounting behind the disclaimer. */
  onAuthed: () => void;
  /** Disclaimer confirmed: reveal the chat now. */
  onConfirm: () => void;
  /** The exit choreography finished: unmount the landing. */
  onDone: () => void;
};

/** WAAPI + SVG path geometry available (false on old browsers and test DOMs). */
const canAnimate = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'
  && typeof SVGPathElement !== 'undefined' && typeof SVGPathElement.prototype.getTotalLength === 'function';
const reduceMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const E = 'cubic-bezier(.3,0,.2,1)';
const X = 'cubic-bezier(.55,0,.8,.4)';
const FULL = 'polygon(0 0,100% 0,100% 100%,0 100%)';
const CLIP: Record<PanelPos, string> = {
  top: 'polygon(0 0,100% 0,100% 101px,0 133px)',
  bottom: 'polygon(0 calc(100% - 153px),100% calc(100% - 113px),100% 100%,0 100%)',
};

/** The three track paths, in viewport pixels, through the logo center. */
function trackPaths(w: number, h: number) {
  const cx = w / 2, cy = h * 0.393;
  const k = Math.max(1, w / 390);
  return [-24, 0, 24].map((dy, i) => {
    const c2 = [67, 55, 43][i];
    const p = (x: number, y: number) => `${(cx + x * k).toFixed(1)} ${(cy + y + dy).toFixed(1)}`;
    return `M ${p(275, -80)} C ${p(135, -90)}, ${p(c2, 0)}, ${p(0, 0)} S ${p(-135, 90)}, ${p(-345, 50)}`;
  });
}

function RobotSvg() {
  return (
    <svg viewBox="-60 -60 120 120" width="100%" height="100%" aria-hidden="true">
      <defs><linearGradient id="v12rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#C9D5E6" /></linearGradient></defs>
      <g fill="#18233A"><rect x="-18" y="-33" width="30" height="10" rx="4" /><rect x="-18" y="23" width="30" height="10" rx="4" /></g>
      <g stroke="#2E3B57" strokeWidth="1.4"><path d="M-12 -33v10M-6 -33v10M0 -33v10M6 -33v10M-12 23v10M-6 23v10M0 23v10M6 23v10" /></g>
      <rect x="-36" y="-23" width="68" height="46" rx="11" fill="url(#v12rb)" />
      <rect x="-24" y="-16" width="34" height="32" rx="7" fill="#0B3F86" />
      <g fill="#6FB3FF">
        {[-12, -6, 0, 6].map((y, r) => [-20, -14, -8, -2, 4].map((x, c) => (
          <rect key={`${r}-${c}`} x={x} y={y} width="3.2" height="3.2" rx="1" opacity={(r + c) % 3 === 0 ? 1 : 0.35} />
        )))}
      </g>
      <rect x="30" y="-20" width="8" height="40" rx="3" fill="#ED1C24" />
      <rect x="38" y="-20" width="9" height="5" rx="2" fill="#ED1C24" /><rect x="38" y="15" width="9" height="5" rx="2" fill="#ED1C24" />
      <circle cx="24" cy="0" r="3.4" fill="#18233A" /><circle cx="24" cy="0" r="1.6" fill="#FF474D" />
    </svg>
  );
}

export default function V12Landing({ signedIn, start = 'intro', onWarm, onAuthed, onConfirm, onDone }: Props) {
  const { t } = useLanguage();
  // No WAAPI / SVG geometry (old browsers, test DOMs): same static path as reduced motion.
  const reduce = useRef(reduceMotion() || !canAnimate()).current;
  const skipIntro = reduce || start === 'login';
  const [phase, setPhase] = useState<'intro' | 'card' | 'leaving'>(skipIntro ? 'card' : 'intro');
  const [view, setView] = useState<'auth' | 'disclaimer'>(signedIn ? 'disclaimer' : 'auth');
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const logoRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<SVGSVGElement>(null);
  const robotRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cinRef = useRef<HTMLDivElement>(null);
  const pnlRef = useRef<HTMLDivElement>(null);
  const buddyRef = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  // -- buddy state
  const [pose, setPose] = useState<RefereePose>('rest');
  const [look, setLook] = useState<{ x: number; y: number } | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [happy, setHappy] = useState(false);
  const [bcls, setBcls] = useState('');
  const bubbleTimer = useRef<number>(0);
  const flash = (cls: string, ms: number) => { setBcls(cls); later(() => setBcls(c => (c === cls ? '' : c)), ms); };
  const buddy: BuddyApi = {
    cover: on => setPose(p => (on ? 'cover' : p === 'cover' ? 'rest' : p)),
    look: setLook,
    say: (text, ms = 900) => { setBubble(text); window.clearTimeout(bubbleTimer.current); bubbleTimer.current = window.setTimeout(() => setBubble(null), ms); },
    no: () => { flash('is-no', 520); cardRef.current?.classList.remove('is-shake'); void cardRef.current?.offsetWidth; cardRef.current?.classList.add('is-shake'); },
  };

  useEffect(() => {
    onWarm?.();
    if (!signedIn) void authFormImport();
    else onAuthed();
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      timers.current.forEach(clearTimeout);
      anims.current.forEach(a => a.cancel());
      window.clearTimeout(bubbleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Where the logo sits in the card layout (center, px) and its scale. */
  const slotTransform = useCallback(() => {
    const r = slotRef.current?.getBoundingClientRect();
    if (!r) return 'translate(50vw, 12vh) scale(.62)';
    return `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px) scale(.62)`;
  }, []);
  const introTransform = () => `translate(${size.w / 2}px, ${size.h * 0.393}px) scale(1)`;

  // Keep the logo glued to its slot once the card is up (resize/keyboard).
  useLayoutEffect(() => {
    if (phase === 'card' && logoRef.current && !anims.current.some(a => a.playState === 'running' && (a.effect as KeyframeEffect)?.target === logoRef.current)) {
      logoRef.current.style.transform = slotTransform();
    }
  });

  // -- intro timeline (WAAPI so a tap can finish it instantly)
  useLayoutEffect(() => {
    if (skipIntro) return;
    const push = (a: Animation | undefined) => { if (a) anims.current.push(a); return a; };
    const svg = tracksRef.current;
    const paths = svg ? Array.from(svg.querySelectorAll('path')) : [];
    // fraction of each path that ends at the logo center (end of the first segment)
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg?.appendChild(tmp);
    const frac = (d: string) => { tmp.setAttribute('d', d.split(' S ')[0]); const a = tmp.getTotalLength(); tmp.setAttribute('d', d); return a / (tmp.getTotalLength() || 1); };
    paths.forEach((p, i) => {
      const d = p.getAttribute('d') || '';
      const L = Math.ceil(p.getTotalLength());
      const g = frac(d);
      p.style.strokeDasharray = String(L);
      p.style.strokeDashoffset = String(L);
      const delay = i % 3 === 0 ? 120 : 120;
      push(p.animate([
        { strokeDashoffset: L, easing: E },
        { strokeDashoffset: L * (1 - g), offset: 0.5 },
        { strokeDashoffset: L * (1 - g), offset: 0.62, easing: X },
        { strokeDashoffset: 0 },
      ], { duration: 2800, delay, fill: 'both' }));
      const halo = p.classList.contains('h');
      push(p.animate([{ opacity: 1 }, { opacity: 0, strokeWidth: halo ? 26 : 9 }], { duration: 1200, delay: 3000 + (i % 3) * 50, fill: 'forwards', easing: 'ease' }));
    });
    const mid = paths[4];
    if (mid && robotRef.current) {
      const d = mid.getAttribute('d') || '';
      const f = frac(d) * 100;
      robotRef.current.style.offsetPath = `path('${d}')`;
      push(robotRef.current.animate([
        { offsetDistance: '0%', easing: E },
        { offsetDistance: `${f}%`, offset: 0.5 },
        { offsetDistance: `${f}%`, offset: 0.62, easing: X },
        { offsetDistance: '100%' },
      ], { duration: 2800, delay: 100, fill: 'both' }));
    }
    tmp.remove();
    push(bloomRef.current?.animate([
      { opacity: 0, transform: 'scale(.3)' }, { opacity: 1, offset: 0.25 }, { opacity: 0, transform: 'scale(1.25)' },
    ], { duration: 1300, delay: 1550, fill: 'both', easing: 'ease-out' }));
    push(tileRef.current?.animate([
      { opacity: 0, transform: 'scale(.4)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' },
    ], { duration: 900, delay: 1620, fill: 'both', easing: 'cubic-bezier(.34,1.4,.5,1)' }));
    const [h1, p] = titleRef.current ? Array.from(titleRef.current.children) as HTMLElement[] : [];
    const rise = [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }];
    push(h1?.animate(rise, { duration: 1000, delay: 3000, fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)' }));
    push(p?.animate(rise, { duration: 800, delay: 3350, fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)' }));
    push(titleRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 3800, fill: 'forwards' }));
    if (logoRef.current) logoRef.current.style.transform = introTransform();
    later(() => {
      if (!logoRef.current) return;
      const a = logoRef.current.animate([{ transform: introTransform() }, { transform: slotTransform() }], { duration: 1000, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' });
      push(a);
      a.onfinish = () => { if (logoRef.current) logoRef.current.style.transform = slotTransform(); a.cancel(); };
    }, 3850);
    later(() => setPhase('card'), 4150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (phase !== 'intro') return;
    anims.current.forEach(a => { try { a.finish(); } catch { a.cancel(); } });
    anims.current.forEach(a => { if ((a.effect as KeyframeEffect)?.target === logoRef.current) a.cancel(); });
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (logoRef.current) logoRef.current.style.transform = slotTransform();
    setPhase('card');
  };

  // Buddy entrance + disclaimer reading once the card is up.
  useEffect(() => {
    if (phase !== 'card') return;
    if (reduce) return;
    later(() => flash('is-in', 900), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Card height follows its content (the panel geometry is pixel-anchored).
  useLayoutEffect(() => {
    const cin = cinRef.current, card = cardRef.current;
    if (!cin || !card || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { card.style.height = `${cin.offsetHeight}px`; });
    ro.observe(cin);
    card.style.height = `${cin.offsetHeight}px`;
    return () => ro.disconnect();
  }, [phase]);

  const fadeIn = () => { cinRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); };
  const sweep: SweepFn = useCallback((to, midpoint) => {
    const pnl = pnlRef.current;
    if (!pnl || reduce) { if (pnl) pnl.dataset.pos = to; midpoint(); return; }
    const from = CLIP[(pnl.dataset.pos as PanelPos) || 'top'];
    const a = pnl.animate([{ clipPath: from }, { clipPath: FULL }, { clipPath: CLIP[to] }], { duration: 750, easing: 'cubic-bezier(.7,0,.2,1)' });
    flash('is-peek', 760);
    window.setTimeout(() => { pnl.dataset.pos = to; midpoint(); fadeIn(); }, 375);
    a.onfinish = () => a.cancel();
  }, [reduce]);

  const handleAuthed = () => {
    onAuthed();
    buddy.cover(false);
    setLook(null);
    sweep('top', () => { setView('disclaimer'); setBcls('is-read'); });
  };
  useEffect(() => { if (view === 'disclaimer' && phase === 'card' && signedIn) later(() => setBcls('is-read'), 900); }, [view, phase, signedIn]);

  const [pressed, setPressed] = useState(false);
  const confirm = () => {
    if (pressed) return;
    setPressed(true);
    if (reduce) { onConfirm(); onDone(); return; }
    setPose('cheer');
    setHappy(true);
    buddy.say('יאללה!', 520);
    flash('is-jump', 560);
    later(() => {
      setPhase('leaving');
      document.documentElement.dataset.v12carry = 'pending';
      onConfirm();
      cardRef.current?.classList.add('is-lift');
      logoRef.current?.animate([{ opacity: 1 }, { opacity: 0, filter: 'blur(6px)' }], { duration: 550, fill: 'forwards', easing: 'ease' });
      // Carry the referee into the chat greeting's spot.
      later(() => {
        const b = buddyRef.current, target = document.querySelector<HTMLElement>('[data-v12-hero-ref]');
        const finish = () => { delete document.documentElement.dataset.v12carry; onDone(); };
        if (!b || !target) { finish(); return; }
        const br = b.querySelector('.v12-ref')!.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const s = tr.width / (br.width || 1);
        const a = b.animate([{ transform: 'none' }, { transform: `translate(${tr.left - br.left}px, ${tr.top - br.top}px) scale(${s})` }], { duration: 1000, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'forwards' });
        a.onfinish = finish;
      }, 150);
    }, 560);
  };

  const paths = trackPaths(size.w, size.h);
  const colors = ['#FF474D', '#F2F5FA', '#4DA3F0'];
  const body = t('disclaimerPopup.body');
  const hlAt = body.indexOf('תמיד');
  return (
    <div className={`v12-root v12-land ${phase === 'leaving' ? 'is-leaving' : ''}`} dir="rtl" data-phase={phase} data-view={view}>
      <div className="v12-bg" />
      <div className="v12-vig" />
      {phase === 'intro' && (
        <>
          <svg ref={tracksRef} className="v12-tracks" width={size.w} height={size.h}>
            <defs><filter id="v12soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4" /></filter></defs>
            {paths.map((d, i) => <path key={`h${i}`} className="h" d={d} stroke={colors[i]} strokeWidth={10} strokeOpacity={i === 1 ? 0.3 : 0.35} filter="url(#v12soft)" />)}
            {paths.map((d, i) => <path key={`c${i}`} d={d} stroke={colors[i]} strokeWidth={2.4} />)}
          </svg>
          <div ref={robotRef} className="v12-robot"><RobotSvg /></div>
          <div ref={titleRef} className="v12-title" style={{ top: size.h * 0.393 + 106 }}>
            <h1>{t('app.title')}</h1>
            <p>מבית <span className="v12-b7">Boeing <i>727</i></span> · FIRST LEGO League</p>
          </div>
          <button type="button" className="v12-skip" aria-label="דלג" onClick={skip} />
        </>
      )}
      <div ref={logoRef} className="v12-logo" style={skipIntro ? undefined : { transform: introTransform() }}>
        <div ref={bloomRef} className="v12-logo-bloom" />
        <div ref={tileRef} className="v12-logo-tile" role="img" aria-label={t('app.title')} />
      </div>
      <div className="v12-col" style={{ visibility: phase === 'intro' ? 'hidden' : 'visible' }}>
        <div ref={slotRef} className="v12-logo-slot" />
        {phase !== 'intro' && (
          <div className="v12-cardwrap">
            <div ref={buddyRef} className={`v12-buddy ${bcls}`}>
              <Referee size={80} pose={pose} look={look} happy={happy} bubble={bubble} glow />
            </div>
            <div ref={cardRef} className="v12-card v12-glass">
              <div ref={pnlRef} className="v12-pnl" data-pos="top" />
              <div ref={cinRef} className="v12-cin">
                {view === 'disclaimer' ? (
                  <>
                    <div className="v12-ph"><h2>{t('disclaimerPopup.title').replace(/\.?$/, '.')}</h2></div>
                    <p className="v12-dp">{hlAt > 0 ? <>{body.slice(0, hlAt)}<b>{body.slice(hlAt)}</b></> : body}</p>
                    <button type="button" className={`v12-go ${pressed ? 'is-press' : ''}`} onClick={confirm} autoFocus>{t('disclaimerPopup.confirm')}</button>
                    <div className="v12-hint">{t('disclaimerPopup.hint')}</div>
                  </>
                ) : (
                  <Suspense fallback={<div className="v12-ph"><h2>ברוכים השבים.</h2><div className="s">כל חוקי FIRST LEGO League, בשיחה אחת</div></div>}>
                    <V12AuthForm buddy={buddy} sweep={sweep} onSuccess={handleAuthed} />
                  </Suspense>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
