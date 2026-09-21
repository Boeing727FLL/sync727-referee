/**
 * ChatBackdrop - the chat screen's own atmosphere (the intro/disclaimer
 * system keeps SpatialBackdrop). A live aurora canvas: deep indigo base,
 * slow-drifting mint and amber light fields that also reach the composer
 * zone, film grain to kill banding, and a light seating vignette. No grid,
 * no map. Pure CSS; the drift keyframes (intro-drift-*) are global and
 * reduced-motion neutral.
 */
export default function ChatBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* deep indigo-slate base */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0b1327 0%, #070c19 42%, #04060c 100%)' }} />
      {/* aurora light fields, drifting slowly - top, mid and composer zone */}
      <div className="absolute inset-0 intro-drift-a" style={{ background: 'radial-gradient(85% 55% at 24% 8%, rgba(96,140,220,0.20), transparent 62%)' }} />
      <div className="absolute inset-0 intro-drift-b" style={{ background: 'radial-gradient(70% 50% at 68% 30%, rgba(126,205,185,0.16), transparent 66%)' }} />
      <div className="absolute inset-0 intro-drift-c" style={{ background: 'radial-gradient(80% 52% at 78% 96%, rgba(251,191,36,0.10), transparent 68%)' }} />
      <div className="absolute inset-0 intro-drift-b" style={{ background: 'radial-gradient(55% 40% at 12% 88%, rgba(126,205,185,0.10), transparent 70%)' }} />
      <div className="absolute inset-0 intro-drift-c" style={{ background: 'radial-gradient(40% 30% at 62% 74%, rgba(255,122,102,0.06), transparent 72%)' }} />
      {/* film grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")" }}
      />
      {/* light seating vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 95% at 50% 42%, transparent 52%, rgba(3,5,9,0.30) 84%, rgba(2,3,6,0.55) 100%)' }} />
    </div>
  );
}
