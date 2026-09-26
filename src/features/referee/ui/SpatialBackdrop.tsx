/**
 * SpatialBackdrop — the shared deep-navy canvas of the intro system.
 *
 * WHAT: deep navy gradient, soft mint/coral light fields drifting almost
 * imperceptibly, a barely-there hairline grid masked to the center, and a
 * seating vignette. Used by the intro and the disclaimer gate so both live
 * in the same space. Pure CSS; reduced motion lands neutral (keyframes
 * start and end identical).
 */
export default function SpatialBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* deep navy base */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #070d1a 0%, #04070d 55%, #030409 100%)' }} />
      {/* soft light fields, drifting almost imperceptibly */}
      <div className="absolute inset-0 intro-drift-a" style={{ background: 'radial-gradient(90% 62% at 50% 28%, rgba(64,118,182,0.12), transparent 62%)' }} />
      <div className="absolute inset-0 intro-drift-b" style={{ background: 'radial-gradient(58% 44% at 50% 34%, rgba(126,205,185,0.09), transparent 66%)' }} />
      <div className="absolute inset-0 intro-drift-c" style={{ background: 'radial-gradient(46% 36% at 76% 84%, rgba(255,122,102,0.05), transparent 72%)' }} />
      {/* barely-there hairline grid, masked to the center */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(159,216,198,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(159,216,198,0.045) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(78% 62% at 50% 42%, black 26%, transparent 76%)',
          WebkitMaskImage: 'radial-gradient(78% 62% at 50% 42%, black 26%, transparent 76%)',
        }}
      />
      {/* seating vignette */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(115% 88% at 50% 40%, transparent 46%, rgba(3,4,7,0.42) 82%, rgba(2,3,6,0.8) 100%)' }} />
    </div>
  );
}
