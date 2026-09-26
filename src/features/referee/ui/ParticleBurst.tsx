/**
 * ParticleBurst — the disclaimer -> chat handoff, Casberry-sphere style.
 *
 * Reference: particles.casberry.in (the dense glowing 3D particle swarms
 * Yuval pointed at). On confirm, the disclaimer's own elements dissolve
 * into ~2,600 tiny glowing points that GATHER into a rotating geodesic
 * (fibonacci) sphere at screen center, hold for a beat, then DISPERSE
 * outward over the freshly revealed chat.
 *
 * COLOR: every point is born in the disclaimer's own palette (mint halo,
 * coral node, slate-white copy, yellow confirm accent) and flips -
 * staggered, so it happens in patches, not all at once - into the chat
 * backdrop's blue/red energy palette around the middle of the sphere
 * hold. Additive canvas blending gives the WebGL-glow look with zero
 * dependencies; reduced-motion callers never mount this.
 */

import { useEffect, useRef } from 'react';

const BLUE = ['#4f8ef7', '#22d3ee', '#7db4ff'];
const RED = ['#ef4444', '#ff6b81', '#fb7185'];

/** The disclaimer stage's own palette: slate-white copy, mint halo/lines,
 *  coral fold node, yellow confirm accent. */
const FROM = ['#f1f5f9', '#cbd5e1', '#8fd6c2', '#9fd8c8', '#ff7a66', '#fde047'];
const FROM_W = [0.22, 0.20, 0.18, 0.16, 0.16, 0.08];

type RGB = [number, number, number];
const hex = (c: string): RGB => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const FROM_RGB = FROM.map(hex);
const BLUE_RGB = BLUE.map(hex);
const RED_RGB = RED.map(hex);
const WHITE: RGB = [255, 255, 255];
const pickFrom = (): RGB => {
  let r = Math.random(), i = 0;
  while (i < FROM_W.length - 1 && (r -= FROM_W[i]) > 0) i++;
  return FROM_RGB[i];
};

/** Mid-hold color flip, staggered per particle so it turns in patches. */
const COLOR_AT = 0.7;
const COLOR_SPAN = 0.55;

/** Seconds. */
const GATHER_END = 0.55;
const DISPERSE_START = 1.15;
const LIFE = 2.1;
const COUNT = 2600;

interface Spark {
  sx: number; sy: number;       // spawn point (disclaimer element geometry)
  sy3: number;                  // sphere slot: y in [-1,1]
  theta: number;                // sphere slot: base angle
  from: RGB;                    // disclaimer color at birth
  to: RGB;                      // chat energy color after the flip
  cshift: number;               // per-particle flip stagger
  size: number;
  wobble: number;               // per-particle phase offset
  outX: number; outY: number;   // disperse direction
}

const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

interface BurstSeed { left: number; top: number; width: number; height: number }

export default function ParticleBurst({ onDone, seeds }: { onDone?: () => void; seeds?: BurstSeed[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2, cy = h * 0.42;
    const R = Math.min(w, h) * 0.30;
    const persp = R * 3.2;

    // Spawn geometry from the disclaimer's own elements. A caller that
    // delays the burst (to keep the chat's mount off the animation's first
    // frames) snapshots these rects at confirm time and passes them in.
    const rects = (seeds && seeds.length ? seeds : Array.from(document.querySelectorAll<HTMLElement>('[data-burst]'))
      .map((el) => el.getBoundingClientRect()))
      .filter((r) => r.width > 0 && r.height > 0);
    const spawn = (): { x: number; y: number } => {
      if (!rects.length) return { x: cx + (Math.random() - 0.5) * w * 0.4, y: cy + (Math.random() - 0.5) * h * 0.4 };
      const r = rects[(Math.random() * rects.length) | 0];
      return { x: r.left + Math.random() * r.width, y: r.top + Math.random() * r.height };
    };

    // Geodesic (fibonacci) sphere slots, colored by side: blue left, red
    // right, white sparks scattered - the backdrop's two fields in one ball.
    const sparks: Spark[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
      const y3 = 1 - (i / (COUNT - 1)) * 2;
      const theta = golden * i;
      const side = Math.cos(theta) * Math.sqrt(1 - y3 * y3); // slot x before spin
      const s = spawn();
      const white = Math.random() < 0.14;
      const bank = side < 0 ? BLUE_RGB : RED_RGB;
      sparks.push({
        sx: s.x, sy: s.y,
        sy3: y3,
        theta,
        from: pickFrom(),
        to: white ? WHITE : bank[(Math.random() * bank.length) | 0],
        cshift: (Math.random() - 0.5) * 0.3,
        size: 1 + Math.random() * 1.3,
        wobble: Math.random() * Math.PI * 2,
        outX: 0, outY: 0,
      });
    }
    // Disperse direction: outward from sphere center with an upward bias.
    for (const p of sparks) {
      const ang = Math.atan2(p.sy - cy, p.sx - cx) + (Math.random() - 0.5) * 0.9;
      const sp = 120 + Math.random() * 260;
      p.outX = Math.cos(ang) * sp;
      p.outY = Math.sin(ang) * sp - 120;
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      if (t >= LIFE) {
        onDoneRef.current?.();
        return;
      }
      const gather = smooth(t / GATHER_END);
      const disperse = smooth((t - DISPERSE_START) / (LIFE - DISPERSE_START));
      const spin = t * 1.6;

      ctx.globalCompositeOperation = 'lighter';
      for (const p of sparks) {
        // Sphere slot, spun around Y, projected with cheap perspective.
        const th = p.theta + spin;
        const rr = Math.sqrt(Math.max(0, 1 - p.sy3 * p.sy3));
        const x3 = Math.cos(th) * rr;
        const z3 = Math.sin(th) * rr;
        const wob = 1 + 0.03 * Math.sin(t * 3 + p.wobble);
        const scale = (persp / (persp + z3 * R)) * wob;
        const bx = cx + x3 * R * scale;
        const by = cy + p.sy3 * R * scale;

        // Gather: spawn -> sphere slot. Disperse: sphere -> outward.
        let x = p.sx + (bx - p.sx) * gather;
        let y = p.sy + (by - p.sy) * gather;
        if (disperse > 0) {
          const dt = (t - DISPERSE_START);
          x += p.outX * dt * disperse * 2.2;
          y += p.outY * dt * disperse * 2.2;
        }

        const depth = Math.max(0.25, Math.min(1.15, scale));
        const a = (1 - disperse) * (0.25 + 0.75 * depth) * (0.35 + 0.65 * gather);
        ctx.globalAlpha = Math.min(1, a);
        const ck = smooth((t - COLOR_AT) / COLOR_SPAN + p.cshift);
        const cr = Math.round(p.from[0] + (p.to[0] - p.from[0]) * ck);
        const cg = Math.round(p.from[1] + (p.to[1] - p.from[1]) * ck);
        const cb = Math.round(p.from[2] + (p.to[2] - p.from[2]) * ck);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        const s = p.size * depth;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[10002] pointer-events-none w-full h-full"
      aria-hidden
    />
  );
}
