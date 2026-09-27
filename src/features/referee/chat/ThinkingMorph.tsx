import { useEffect, useRef } from 'react';

/** Decorative FIRST-colour particle morph. It never consumes or displays model thoughts. */
export default function ThinkingMorph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    const ctx = context;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 600px)');
    let frame = 0;
    let last = 0;
    let start = performance.now();
    let width = 240;
    let height = 146;
    let dpr = 1;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const seed = (i: number) => {
      const x = Math.sin(i * 78.233 + 12.937) * 43758.5453;
      return x - Math.floor(x);
    };
    const ease = (v: number) => {
      const x = Math.max(0, Math.min(1, v));
      return x * x * (3 - 2 * x);
    };
    const point = (phase: number, i: number, n: number, t: number): [number, number] => {
      const a = Math.PI * 2 * i / n;
      const noise = seed(i * 13 + 5) - 0.5;
      if (phase === 0) {
        const radius = 48 + noise * 13;
        return [Math.cos(a + t * .27) * radius, Math.sin(a + t * .27) * radius * .84];
      }
      if (phase === 1) {
        const radius = 38 + 21 * Math.sin(a * 2 + t * .75) + noise * 9;
        return [Math.cos(a + t * .08) * radius * 1.38, Math.sin(a + t * .08) * radius * .7 + 9 * Math.sin(a * 3 + t * 1.2)];
      }
      return [Math.cos(a + t * .35) * 62, Math.sin(a + t * .35) * 25 + 9 * Math.sin(3 * a + t)];
    };
    const paint = (now: number) => {
      frame = requestAnimationFrame(paint);
      if (now - last < (mobile.matches ? 32 : 24)) return;
      last = now;
      ctx.clearRect(0, 0, width, height);
      const n = mobile.matches ? 240 : 360;
      if (reduced.matches) {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.strokeStyle = '#89C8FF';
        ctx.globalAlpha = .7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 52, 43, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      // Visual states cycle while the request is pending; they do not claim an engine stage.
      const t = (now - start) / 1000;
      const cycle = t % 7.5;
      const phase = cycle < 2.1 ? 0 : cycle < 4.7 ? 1 : 2;
      const boundary = phase === 0 ? 2.1 : phase === 1 ? 4.7 : 7.5;
      const blend = ease((cycle - (boundary - .62)) / .62);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      const scale = Math.min(width / 240, height / 146);
      ctx.scale(scale, scale);
      const colors = ['#75C4FF', '#EEF3FA', '#ED1C24'];
      for (let layer = 1; layer >= 0; layer--) {
        for (let i = 0; i < n; i++) {
          const p = point(phase, i, n, t);
          const q = point((phase + 1) % 3, i, n, t);
          const x = p[0] + (q[0] - p[0]) * blend;
          const y = p[1] + (q[1] - p[1]) * blend;
          const color = i % 27 === 0 ? colors[2] : i % 5 === 0 ? colors[1] : colors[0];
          ctx.fillStyle = color;
          ctx.globalAlpha = layer === 0 ? .82 : .13;
          ctx.shadowColor = color;
          ctx.shadowBlur = layer === 0 ? 5 : 11;
          ctx.beginPath();
          ctx.arc(x, y, (layer === 0 ? .8 : 2) * (.7 + seed(i * 7 + 1)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className="v12-thinking-morph" aria-hidden="true" />;
}
