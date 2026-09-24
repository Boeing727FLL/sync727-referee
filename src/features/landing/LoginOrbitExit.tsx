/**
 * LoginOrbitExit — the login form's orbit choreography, after the orbit
 * reference the owner picked.
 *
 * SUCCESS (login -> disclaimer handoff): the form's rows lift off as
 * tiles, curl into a tight cluster around the form's center, spin a turn
 * and a quarter as ONE connected piece (hairline orbit + hub dot tie them
 * together), screw down into the hub, and land as one verified tile. The
 * disclaimer gate opens out of that beat.
 *
 * FAILURE (wrong credentials etc.): the same curl, cluster and spin, but
 * the cluster screws down into one RED tile with an X - the animation IS
 * the failure message (it replaces the small error box). The X holds a
 * beat, the cluster un-screws and the tiles fly back to their rows, and
 * the form returns for another try.
 *
 * HOW: the rows' geometry is snapshotted at the moment of the result and
 * the real form is cut behind the ghosts. Each ghost rides to its ring
 * slot with WAAPI; ONE ring rotation carries every tile around the hub —
 * transform origin at the hub, rotate() draws the circle — while the
 * ring's scale screws the cluster down to a point. Transform/opacity
 * only; the parent never mounts this under reduced motion.
 */

import { useEffect, useRef, useState } from 'react';

export interface OrbitSeed {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
}

export interface OrbitSlot { x: number; y: number }

/** The hub is the form's own center; the ring is tight — the tiles nearly
 *  touch (like the reference's boxes), so the spin reads as ONE connected
 *  unit turning, not separate chips on a wide orbit. Pure for testing. */
export function orbitGeometry(seeds: OrbitSeed[], viewportW: number, viewportH: number): { cx: number; cy: number; radius: number; slots: OrbitSlot[] } {
  const cx = seeds.reduce((a, s) => a + s.left + s.width / 2, 0) / seeds.length;
  const cy = seeds.reduce((a, s) => a + s.top + s.height / 2, 0) / seeds.length;
  const radius = Math.max(60, Math.min(76, Math.min(viewportW, viewportH) * 0.2));
  const slots = seeds.map((_, i) => {
    const a = (-90 + (i * 360) / seeds.length) * (Math.PI / 180);
    return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  });
  return { cx, cy, radius, slots };
}

/** ms timeline: curl onto the ring, a turn and a quarter, the result tile
 *  pops as the cluster lands. Success: the gate opens out of the pop and
 *  the overlay leaves. Failure: the X holds, the cluster un-screws, the
 *  tiles fly home and the form returns. */
const CURL_MS = 520;
const SPIN_MS = 1500;
const TILE_AT = CURL_MS + SPIN_MS - 130;
const GATE_AT = TILE_AT + 260;
const FADE_AT = GATE_AT + 420;
const DONE_AT = FADE_AT + 320;
/** Failure-only beats: the X holds, then the form comes back. */
const FAIL_HOLD_MS = 950;
const UNSCREW_MS = 420;
const RETURN_MS = 520;
const FAIL_RETURN_AT = TILE_AT + FAIL_HOLD_MS;
const FAIL_HOME_AT = FAIL_RETURN_AT + UNSCREW_MS;
const FAIL_DONE_AT = FAIL_HOME_AT + RETURN_MS + 120;
/** A turn and a quarter, clockwise, matching the reference. */
const TURN_DEG = 450;
/** Tiles shrink to a uniform box width as they curl in (the reference's
 *  boxes are all the same size, which is what makes the cluster read as
 *  one connected piece). */
const TARGET_TILE_W = 96;

export default function LoginOrbitExit({ seeds, variant = 'success', onGate, onDone }: {
  seeds: OrbitSeed[];
  variant?: 'success' | 'fail';
  /** Success only: fire when the disclaimer gate should open. */
  onGate?: () => void;
  /** Fire when the overlay has fully left (success) or the tiles are home
   *  and the form should return (failure). */
  onDone: () => void;
}) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [fading, setFading] = useState(false);

  const { cx, cy, radius, slots } = orbitGeometry(
    seeds,
    typeof window === 'undefined' ? 390 : window.innerWidth,
    typeof window === 'undefined' ? 844 : window.innerHeight,
  );

  useEffect(() => {
    const anims: Animation[] = [];
    tileRefs.current.forEach((el, i) => {
      const s = seeds[i];
      const slot = slots[i];
      if (!el || !s || !slot) return;
      const sx = s.left + s.width / 2 - cx;
      const sy = s.top + s.height / 2 - cy;
      // Wide tiles (the email) shrink to the box size as they curl in, so
      // the cluster is uniform like the reference's equal boxes. Measured
      // on the tile itself - the seed row is full form width.
      const sc = Math.min(1, TARGET_TILE_W / (el.offsetWidth || TARGET_TILE_W));
      const frames: Keyframe[] = [
        { transform: `translate(-50%, -50%) translate(${sx}px, ${sy}px) scale(1)`, opacity: 0, easing: 'cubic-bezier(0.3, 0.7, 0.25, 1)' },
        { transform: `translate(-50%, -50%) translate(${sx + (slot.x - sx) * 0.3}px, ${sy + (slot.y - sy) * 0.3}px) scale(${1 - (1 - sc) * 0.3})`, opacity: 1, offset: (0.35 * CURL_MS) / 10000, easing: 'cubic-bezier(0.3, 0.7, 0.25, 1)' },
        { transform: `translate(-50%, -50%) translate(${slot.x}px, ${slot.y}px) scale(${sc})`, opacity: 1, offset: CURL_MS / 10000 },
      ];
      if (variant === 'fail') {
        // Home again: the cluster un-screws (ring scale 0 -> 1) and every
        // tile flies back to its row, fading into the returning form.
        frames.push(
          { transform: `translate(-50%, -50%) translate(${slot.x}px, ${slot.y}px) scale(${sc})`, opacity: 1, offset: FAIL_HOME_AT / 10000, easing: 'cubic-bezier(0.3, 0.7, 0.25, 1)' },
          { transform: `translate(-50%, -50%) translate(${sx}px, ${sy}px) scale(1)`, opacity: 0, offset: FAIL_DONE_AT / 10000 },
        );
      }
      anims.push(el.animate(frames, { duration: 10000, easing: 'linear', fill: 'both' }));
    });
    // One rotation moves every tile along the circle (and tumbles it, like
    // the reference); the scale screws the cluster down into the hub.
    if (ringRef.current) {
      const ringFrames: Keyframe[] = [
        { transform: 'rotate(0deg) scale(1)', offset: 0 },
        { transform: 'rotate(0deg) scale(1)', offset: CURL_MS / 10000, easing: 'cubic-bezier(0.5, 0.05, 0.3, 1)' },
        { transform: `rotate(${TURN_DEG * 0.6}deg) scale(0.94)`, offset: (CURL_MS + SPIN_MS * 0.6) / 10000, easing: 'cubic-bezier(0.5, 0.05, 0.3, 1)' },
        { transform: `rotate(${TURN_DEG}deg) scale(0)`, offset: (CURL_MS + SPIN_MS) / 10000 },
      ];
      if (variant === 'fail') {
        ringFrames.push(
          { transform: `rotate(${TURN_DEG}deg) scale(0)`, offset: FAIL_RETURN_AT / 10000, easing: 'cubic-bezier(0.3, 0.7, 0.25, 1)' },
          { transform: `rotate(${TURN_DEG}deg) scale(1)`, offset: FAIL_HOME_AT / 10000 },
        );
      }
      anims.push(ringRef.current.animate(ringFrames, { duration: 10000, easing: 'linear', fill: 'both' }));
    }
    const timers = variant === 'fail'
      ? [window.setTimeout(onDone, FAIL_DONE_AT)]
      : [
          window.setTimeout(() => onGate?.(), GATE_AT),
          window.setTimeout(() => setFading(true), FADE_AT),
          window.setTimeout(onDone, DONE_AT),
        ];
    return () => {
      anims.forEach((a) => a.cancel());
      timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="login-orbit" data-fading={fading || undefined} dir="rtl" aria-hidden>
      <div ref={ringRef} className="login-orbit-ring" style={{ left: cx, top: cy }}>
        <div
          className="login-orbit-loop"
          style={{ width: radius * 2, height: radius * 2, margin: `${-radius}px 0 0 ${-radius}px`, animationDelay: '0.25s' }}
        />
        <div className="login-orbit-hubdot" style={{ animationDelay: '0.45s' }} />
        {seeds.map((s, i) => (
          <div
            key={i}
            ref={(el) => { tileRefs.current[i] = el; }}
            className="login-orbit-tile"
            style={{ animationDelay: `${CURL_MS + 250}ms` }}
          >
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      {variant === 'fail' ? (
        <div className="login-orbit-verified login-orbit-rejected" style={{ left: cx, top: cy, animationDelay: `${TILE_AT}ms, ${FAIL_RETURN_AT}ms` }}>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle
              cx="32" cy="32" r="26" fill="none"
              stroke="rgba(255, 122, 102, 0.45)" strokeWidth="1.5" strokeDasharray="3 6"
              className="login-orbit-dashring"
              style={{ animationDelay: `${TILE_AT + 150}ms` }}
            />
            <path
              d="M 24 24 L 40 40" fill="none"
              stroke="rgba(255, 122, 102, 0.95)" strokeWidth="3.5" strokeLinecap="round"
              pathLength={1} className="login-orbit-check"
              style={{ animationDelay: `${TILE_AT + 160}ms` }}
            />
            <path
              d="M 40 24 L 24 40" fill="none"
              stroke="rgba(255, 122, 102, 0.95)" strokeWidth="3.5" strokeLinecap="round"
              pathLength={1} className="login-orbit-check"
              style={{ animationDelay: `${TILE_AT + 280}ms` }}
            />
          </svg>
        </div>
      ) : (
        <div className="login-orbit-verified" style={{ left: cx, top: cy, animationDelay: `${TILE_AT}ms` }}>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle
              cx="32" cy="32" r="26" fill="none"
              stroke="rgba(159, 216, 198, 0.4)" strokeWidth="1.5" strokeDasharray="3 6"
              className="login-orbit-dashring"
              style={{ animationDelay: `${TILE_AT + 150}ms` }}
            />
            <path
              d="M 22 33 L 29.5 40.5 L 43 25" fill="none"
              stroke="rgba(159, 216, 198, 0.95)" strokeWidth="3.5"
              strokeLinecap="round" strokeLinejoin="round"
              pathLength={1}
              className="login-orbit-check"
              style={{ animationDelay: `${TILE_AT + 160}ms` }}
            />
          </svg>
        </div>
      )}
    </div>
  );
}
