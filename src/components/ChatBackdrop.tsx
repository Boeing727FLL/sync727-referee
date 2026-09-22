/**
 * ChatBackdrop - the chat screen's own atmosphere (the intro/disclaimer
 * system keeps SpatialBackdrop). The FIRST mark formed from light: a deep
 * FIRST-blue wave sweeps in from the left and crystallizes into the
 * triangle, a FIRST-red wave sweeps in from the right and forms the
 * square, and where the two collide a white-hot energy core ignites the
 * circle - the official icon geometry emerging from one liquid Siri-like
 * flow, dimensional and glass-lit, over a deep polished void. The
 * conversation zone stays quiet so the liquid-glass UI refracts the glow
 * beneath it. A whisper of the active season's color rises from the
 * floor, film grain kills banding, and a seating vignette seats the
 * frame. The artwork is a pair of purpose-built renders (public/chat-glow.webp
 * wide, public/chat-glow-tall.webp portrait), center-anchored so the mark
 * survives any aspect crop.
 */
export default function ChatBackdrop({ tint = '#46536a' }: { tint?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* deep base (also the image's fallback while it loads) */}
      <div className="absolute inset-0" style={{ background: '#04060c' }} />
      {/* the liquid light, center-anchored so the mark holds on any crop;
          a purpose-built tall composition serves portrait screens */}
      <img
        src="/chat-glow.webp"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover select-none hidden md:block"
        style={{ objectPosition: '50% 50%' }}
      />
      <img
        src="/chat-glow-tall.webp"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover select-none md:hidden"
        style={{ objectPosition: '50% 50%' }}
      />
      {/* seating for the composer over the brightest glow */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, transparent 52%, rgba(4,6,12,0.34) 76%, rgba(4,6,12,0.66) 100%)' }}
      />
      {/* legibility scrim over the conversation zone - barely there, the art stays loud */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(4,6,12,0.30) 0%, rgba(4,6,12,0.10) 34%, rgba(4,6,12,0.08) 62%, rgba(4,6,12,0.22) 100%)' }}
      />
      {/* soft quiet zone behind the conversation so text floats over the white core */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(72% 52% at 50% 44%, rgba(4,6,12,0.30), rgba(4,6,12,0.10) 58%, transparent 78%)' }}
      />
      {/* the active season's color, rising faintly from the floor into the glow */}
      <div className="absolute inset-0 mix-blend-soft-light" style={{ background: `radial-gradient(90% 46% at 50% 108%, ${tint}30, transparent 66%)` }} />
      {/* film grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")" }}
      />
      {/* seating vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 95% at 50% 42%, transparent 52%, rgba(3,5,9,0.26) 84%, rgba(2,3,6,0.5) 100%)' }} />
    </div>
  );
}
