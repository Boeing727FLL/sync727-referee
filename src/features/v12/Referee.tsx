/**
 * Referee - the generic cartoon FLL field referee (yellow/black stripes,
 * tall checkered hat). Pure SVG + CSS, no images. Poses morph the arms with
 * jointed arms: each arm is one attached limb (shoulder > upper arm > elbow >
 * forearm > hand) that bends at the shoulder and elbow. rest = arms crossed,
 * cover = palms over the eyes, cheer = both arms up (one-shot, back to rest).
 */
import { useEffect, useId, useRef, useState } from 'react';

export type RefereePose = 'rest' | 'cover' | 'cheer';

type Props = {
  size: number;
  pose?: RefereePose;
  /** Eye offset, in percent of the eye box (translate), e.g. {x:20,y:10}. */
  look?: { x: number; y: number } | null;
  happy?: boolean;
  float?: boolean;
  glow?: boolean;
  bubble?: string | null;
  className?: string;
  style?: React.CSSProperties;
};

export default function Referee({ size, pose = 'rest', look = null, happy = false, float = false, glow = false, bubble = null, className = '', style }: Props) {
  const uid = 'r' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const prev = useRef<RefereePose>(pose);
  const [anim, setAnim] = useState<'' | 'cov' | 'unc' | 'chr'>('');
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = pose;
    if (from === pose) return;
    if (pose === 'cover') setAnim('cov');
    else if (pose === 'cheer') setAnim('chr');
    else if (from === 'cover') setAnim('unc');
    else if (from === 'cheer') return; // the cheer keyframes already land on rest
    setAnimKey(k => k + 1);
  }, [pose]);
  // Clamp glances so the eyes always stay on the face.
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  const eyeStyle = look ? { transform: `translate(calc(-50% + ${clamp(look.x, 22)}%), calc(-50% + ${clamp(look.y, 18)}%))` } : undefined;
  return (
    <div
      className={`v12-ref ${float ? 'v12-ref-float' : ''} ${className}`}
      data-anim={anim}
      data-pose={pose}
      style={{ fontSize: size, ...style }}
      aria-hidden="true"
    >
      {glow && <div className="v12-ref-glow" />}
      <div className="v12-ref-bd" key={animKey}>
        {/* The eyes live inside the same moving/breathing box as the face,
            so float, wobble and breathe never pull them off it. */}
        <div className="v12-ref-bb">
        <svg className="v12-ref-svg" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{overflow:"visible"}}><defs><pattern id={`${uid}s`} width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#FFD21F"/><rect width="4.5" height="10" fill="#1B1E24"/></pattern><pattern id={`${uid}c`} width="12" height="10" patternUnits="userSpaceOnUse" x="3"><rect width="12" height="10" fill="#F2F5FA"/><rect width="6" height="5" fill="#1B1E24"/><rect x="6" y="5" width="6" height="5" fill="#1B1E24"/></pattern></defs><path d="M28 79 C 20 83, 18 96, 20 110 C 21 125, 24 136, 29 140 L 71 140 C 76 136, 79 125, 80 110 C 82 96, 80 83, 72 79 C 64 76, 36 76, 28 79 Z" fill={`url(#${uid}s)`}/><path d="M29 138 L71 138 L72 147 C 60 149, 40 149, 28 147 Z" fill="#1B1E24"/><rect x="46" y="139.5" width="8" height="6" rx="1.2" fill="none" stroke="#C9A227" strokeWidth="1.4"/><path d="M40 77 L50 90 L60 77 Z" fill="#1B1E24"/><path d="M44 78 C 44 88, 47 96, 50 100 M56 78 C 56 88, 53 96, 50 100" stroke="#ED1C24" strokeWidth="2.4" fill="none"/><rect x="45" y="97" width="10" height="7" rx="1.5" fill="#F2F5FA"/><path d="M43 66 L57 66 L56 78 L44 78 Z" fill="#E4B38E"/><ellipse cx="21" cy="50" rx="5" ry="7" fill="#EDBE98"/><ellipse cx="79" cy="50" rx="5" ry="7" fill="#EDBE98"/><path d="M50 18 C 71 18, 79 32, 78 48 C 77 64, 66 73, 50 73 C 34 73, 23 64, 22 48 C 21 32, 29 18, 50 18 Z" fill="#F4CDA8"/><ellipse cx="33" cy="60" rx="5" ry="3" fill="#F29B8A" opacity=".45"/><ellipse cx="67" cy="60" rx="5" ry="3" fill="#F29B8A" opacity=".45"/><path className="mo" d="M44 63 C 47 66, 53 66, 56 63" stroke="#8A4630" strokeWidth="2.2" fill="none" strokeLinecap="round"/><path d="M27 36 C 26 22, 27 6, 30 -8 C 42 -12, 60 -12, 72 -8 C 75 6, 76 22, 75 36 Z" fill={`url(#${uid}c)`}/><path d="M27 36 C 26 22, 27 6, 30 -8 C 42 -12, 60 -12, 72 -8 C 75 6, 76 22, 75 36 Z" fill="none" stroke="#1B1E24" strokeWidth="1.6"/><path d="M18 38 C 34 32, 68 32, 84 38 C 78 44, 26 45, 18 38 Z" fill="#1B1E24"/><g className="arm armL"><g className="ua"><path d="M-5.6 -3 C-6.2 4, -5.6 10, -4.6 14 L4.6 14 C5.6 10, 6.2 4, 5.6 -3 C3 -6.5, -3 -6.5, -5.6 -3 Z" fill={`url(#${uid}s)`}/><rect x="-4.3" y="12" width="8.6" height="9" rx="4.3" fill="#F4CDA8"/><g className="fa"><rect x="-4" y="-3" width="8" height="25" rx="4" fill="#F4CDA8"/><path d="M-5 20 C-6.4 23, -6.6 27.5, -5.4 30.5 C-4.4 32.8, -2 33.8, 0.4 33.8 C3.2 33.8, 5.6 32.4, 6 29.6 C6.4 26.8, 6 22.6, 5 20 Z" fill="#F4CDA8" stroke="#C98E66" strokeWidth=".8"/><path d="M-5 23 C-8.6 23.6, -9.6 27, -8.2 28.6 C-7.2 29.6, -5.6 28.8, -5.2 27 Z" fill="#F4CDA8" stroke="#C98E66" strokeWidth=".8"/></g></g></g><g transform="translate(100 0) scale(-1 1)"><g className="arm armR"><g className="ua"><path d="M-5.6 -3 C-6.2 4, -5.6 10, -4.6 14 L4.6 14 C5.6 10, 6.2 4, 5.6 -3 C3 -6.5, -3 -6.5, -5.6 -3 Z" fill={`url(#${uid}s)`}/><rect x="-4.3" y="12" width="8.6" height="9" rx="4.3" fill="#F4CDA8"/><g className="fa"><rect x="-4" y="-3" width="8" height="25" rx="4" fill="#F4CDA8"/><path d="M-5 20 C-6.4 23, -6.6 27.5, -5.4 30.5 C-4.4 32.8, -2 33.8, 0.4 33.8 C3.2 33.8, 5.6 32.4, 6 29.6 C6.4 26.8, 6 22.6, 5 20 Z" fill="#F4CDA8" stroke="#C98E66" strokeWidth=".8"/><path d="M-5 23 C-8.6 23.6, -9.6 27, -8.2 28.6 C-7.2 29.6, -5.6 28.8, -5.2 27 Z" fill="#F4CDA8" stroke="#C98E66" strokeWidth=".8"/></g></g></g></g></svg>
        <div className={`v12-ref-ey ${happy ? 'is-happy' : ''} ${pose === 'cover' ? 'is-hidden' : ''}`} style={eyeStyle}><i /><i /></div>
        </div>
      </div>
      {bubble && <div className="v12-ref-bub" key={bubble}>{bubble}</div>}
    </div>
  );
}
