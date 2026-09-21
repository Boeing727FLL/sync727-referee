/**
 * ChatBackdrop - the chat screen's own atmosphere (the intro/disclaimer
 * system keeps SpatialBackdrop). The arena at night from the referee's
 * seat: a single cool hall spotlight from above, the game mat's field
 * lines etched faintly into the dark, a whisper of the active season's
 * color rising from the floor, film grain to kill banding, and a seating
 * vignette. No aurora, no map. Pure CSS/SVG; the spotlight drift
 * (intro-drift-a) is global and reduced-motion neutral.
 */
export default function ChatBackdrop({ tint = '#46536a' }: { tint?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* deep hall base */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0a1122 0%, #070c19 46%, #04060c 100%)' }} />
      {/* one overhead hall light, slowly breathing */}
      <div className="absolute inset-0 intro-drift-a" style={{ background: 'radial-gradient(72% 42% at 50% -4%, rgba(148,180,235,0.16), transparent 64%)' }} />
      {/* the mat, etched faintly into the dark: border, center circle, mission marks */}
      <svg
        className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 scale-y-[0.78] w-[min(150vw,1150px)] text-white opacity-[0.05]"
        viewBox="0 0 800 500"
        fill="none"
        style={{ maskImage: 'radial-gradient(82% 74% at 50% 58%, black 34%, transparent 78%)', WebkitMaskImage: 'radial-gradient(82% 74% at 50% 58%, black 34%, transparent 78%)' }}
      >
        <rect x="42" y="32" width="716" height="436" rx="26" stroke="currentColor" strokeWidth="2.5" />
        <rect x="86" y="76" width="628" height="348" rx="16" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        <circle cx="400" cy="250" r="72" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="400" cy="250" r="7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="196" cy="158" r="30" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="604" cy="158" r="30" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="196" cy="342" r="30" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="604" cy="342" r="30" stroke="currentColor" strokeWidth="1.4" />
        <path d="M226 158 C 300 158, 328 210, 340 250" stroke="currentColor" strokeWidth="1.4" />
        <path d="M574 158 C 500 158, 472 210, 460 250" stroke="currentColor" strokeWidth="1.4" />
        <path d="M226 342 C 300 342, 328 290, 340 250" stroke="currentColor" strokeWidth="1.4" />
        <path d="M574 342 C 500 342, 472 290, 460 250" stroke="currentColor" strokeWidth="1.4" />
        <path d="M42 250 H 96 M 704 250 H 758" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      {/* the active season's color, rising faintly from the floor */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(90% 46% at 50% 108%, ${tint}14, transparent 66%)` }} />
      {/* film grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")" }}
      />
      {/* seating vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 95% at 50% 42%, transparent 52%, rgba(3,5,9,0.30) 84%, rgba(2,3,6,0.55) 100%)' }} />
    </div>
  );
}
