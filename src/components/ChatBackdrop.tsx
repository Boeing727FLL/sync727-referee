/**
 * ChatBackdrop - the desk under the referee's match sheet. Flat deep navy,
 * film grain, and a light seating vignette. No aurora, no glow, no grid:
 * the paper sheet carries the identity.
 */
export default function ChatBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ background: '#0a0e19' }} />
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")" }}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(125% 100% at 50% 40%, transparent 55%, rgba(3,5,9,0.28) 85%, rgba(2,3,6,0.5) 100%)' }} />
    </div>
  );
}
