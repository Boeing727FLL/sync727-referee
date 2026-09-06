/**
 * IntroScreen — the first impression (brand bar + hero + entry CTA).
 *
 * WHAT: a full-screen takeover shown before login/chat. Its only job is
 * trust in under three seconds: Boeing 727 brand, referee emblem,
 * one-line promise, three proof cards, one solid entry button.
 *
 * DESIGN LAW: quiet luxury. One calm entrance sequence (top to bottom),
 * then stillness — no loops, no pulsing, no floating decor. The background
 * is a clean dark field; the logo fades in gently; the button sits still.
 */

import { motion } from 'framer-motion';
import { MessageCircle, Smartphone, FileCheck } from 'lucide-react';

// ---------------------------------------------------------------------------
// Configuration constants (single calm entrance ladder, then stillness)
// ---------------------------------------------------------------------------

/** Staggered entrance delays: the eye's top-to-bottom reading path. */
const ENTER_DELAY = {
  brand: 0.05,
  logo: 0.1,
  badge: 0.2,
  title: 0.25,
  subtitle: 0.3,
  features: 0.36,
  cta: 0.5,
} as const;

/** Gap between feature cards firing in. */
const FEATURE_STAGGER = 0.09;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntroScreenProps {
  hasGoogleToken: boolean;
  user: unknown;
  onContinue: () => void;
  t: (key: string) => string;
}

type Feature = {
  icon: typeof MessageCircle;
  title: string;
  desc: string;
};

/** The three proof cards, translated at render time. */
function buildFeatures(t: (key: string) => string): Feature[] {
  return [
    { icon: MessageCircle, title: t('intro.feature1Title'), desc: t('intro.feature1Desc') },
    { icon: Smartphone, title: t('intro.feature2Title'), desc: t('intro.feature2Desc') },
    { icon: FileCheck, title: t('intro.feature3Title'), desc: t('intro.feature3Desc') },
  ];
}

// ---------------------------------------------------------------------------
// Presentational pieces (no hooks, no logic — pure props in, JSX out)
// ---------------------------------------------------------------------------

/** Fixed dark field backdrop: static image, veil, one soft glow. */
function Backdrop() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-slate-950" aria-hidden>
      {/* tiny placeholder for instant paint (600 bytes) - v2 fictional names */}
      <img
        src="/bioglow-cutout-placeholder.webp?v=2"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover object-center blur-[12px] scale-110 opacity-60"
        decoding="async"
      />
      <img
        src="/bioglow-cutout-3000.webp?v=2"
        srcSet="/bioglow-cutout-2x.webp?v=2 1500w, /bioglow-cutout-3000.webp?v=2 3000w"
        sizes="100vw"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center blur-[5px] md:blur-[6px] scale-[1.03]"
        fetchPriority="high"
        decoding="sync"
        loading="eager"
      />
      {/* veil — darker for text readability, no card needed */}
      <div className="absolute inset-0 bg-slate-950/45" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/25 to-slate-950/55" />
      {/* one still top glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-yellow-400/[0.07] rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}

/** Sticky Boeing 727 brand bar pinned to the top. */
function BrandBar() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: ENTER_DELAY.brand }}
      className="sticky top-0 z-50 border-b border-white/10 px-6 py-4 md:py-5 flex items-center justify-center shrink-0 bg-slate-950/70 backdrop-blur-md"
    >
      <div className="flex items-center gap-4 md:gap-6">
        <img
          src="/boeing_727_logo_transparent_pure_red (1).png"
          alt="Boeing 727"
          className="h-12 md:h-16 w-auto object-contain drop-shadow-[0_0_18px_rgba(239,68,68,0.35)]"
          draggable={false}
        />
        <div className="h-10 w-[2px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
        <div className="flex flex-col items-start leading-none">
          <span className="text-white font-black tracking-tighter text-2xl md:text-3xl italic">
            Boeing <span className="text-primary not-italic">727</span>
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-white/60 font-black uppercase tracking-[0.5em]">The Team</span>
            <span className="w-1 h-1 bg-primary rounded-full" aria-hidden />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** The referee emblem in a quiet gold frame: one gentle fade-in. */
function HeroLogo() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.55, delay: ENTER_DELAY.logo, ease: [0.22, 1, 0.36, 1] }}
      className="relative mb-5 md:mb-6"
    >
      {/* soft halo */}
      <div className="absolute -inset-6 bg-yellow-400/10 blur-2xl rounded-full pointer-events-none" aria-hidden />
      {/* gold frame */}
      <div className="relative w-28 h-28 md:w-40 md:h-40 rounded-full p-[3px] bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-600 shadow-[0_8px_32px_rgba(250,204,21,0.3),0_4px_16px_rgba(0,0,0,0.4)]">
        <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden relative">
          <img
            src="/logoref.png"
            alt="שופט וירטואלי"
            className="w-[84%] h-[84%] object-contain select-none relative z-10"
            draggable={false}
          />
          {/* inner highlight */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/40 via-transparent to-transparent opacity-60 pointer-events-none" aria-hidden />
        </div>
      </div>
      {/* thin outer ring */}
      <div className="absolute -inset-1.5 rounded-full border border-yellow-400/20 pointer-events-none" aria-hidden />
    </motion.div>
  );
}

/** One proof card: icon chip + bold title + one-line proof. */
function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: ENTER_DELAY.features + index * FEATURE_STAGGER, duration: 0.4 }}
      className="bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-5 flex md:flex-col items-start md:items-center md:text-center gap-3 md:gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
    >
      <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-yellow-400/15 border border-yellow-400/25 flex items-center justify-center text-yellow-300">
        <Icon className="w-5 h-5 md:w-6 md:h-6" />
      </div>
      <div className="flex-1 md:flex-none min-w-0">
        <h4 className="text-sm md:text-[15px] font-black text-white leading-tight mb-1">{feature.title}</h4>
        <p className="text-xs md:text-xs text-slate-300 leading-relaxed font-medium">{feature.desc}</p>
      </div>
    </motion.div>
  );
}

/** The entry button: solid gold, steady, professional. No glow games. */
function EntryButton({ label, onContinue }: { label: string; onContinue: () => void }) {
  return (
    <button
      onClick={onContinue}
      className="w-full bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black py-4 px-6 rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-base md:text-lg shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
    >
      <span>{label}</span>
      <span className="text-xl" aria-hidden>
        ←
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The screen: brand bar + hero stack (logo, badge, title, promise, proof, CTA)
// ---------------------------------------------------------------------------

export default function IntroScreen({ hasGoogleToken, user, onContinue, t }: IntroScreenProps) {
  const isLoggedIn = Boolean(hasGoogleToken || user);
  const features = buildFeatures(t);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-y-auto no-scrollbar"
      dir="rtl"
    >
      <Backdrop />
      {/* ===== Content ===== */}
      <div className="relative z-10 flex flex-col min-h-full flex-1">
        <BrandBar />

        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 py-6 md:py-8 text-center w-full max-w-5xl mx-auto">
          <HeroLogo />

          {/* Badge — quiet status pill */}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: ENTER_DELAY.badge, duration: 0.4 }}
            className="inline-flex items-center gap-2 bg-slate-900/50 backdrop-blur-xl text-yellow-300 text-[11px] md:text-xs font-bold px-4 md:px-5 py-1.5 md:py-2 rounded-full border border-yellow-400/30 shadow-[0_4px_16px_rgba(0,0,0,0.3)] mb-5 md:mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]" aria-hidden />
            {t('intro.badge')}
          </motion.span>

          {/* Title — clean solid white, sharp and legible */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: ENTER_DELAY.title, duration: 0.45 }}
            className="mb-3 md:mb-4"
          >
            <h2
              className="text-3xl md:text-6xl font-black text-white leading-tight tracking-tight"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              {t('intro.subtitle')}
            </h2>
            {/* restrained gold rule */}
            <div className="flex items-center justify-center gap-3 mt-3 md:mt-4">
              <div className="h-[1px] w-8 md:w-12 bg-gradient-to-r from-transparent to-white/20" aria-hidden />
              <div className="w-16 md:w-24 h-[2px] bg-yellow-400/80 rounded-full" aria-hidden />
              <div className="h-[1px] w-8 md:w-12 bg-gradient-to-l from-transparent to-white/20" aria-hidden />
            </div>
          </motion.div>

          {/* Subtitle — the one-line promise in calm glass */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: ENTER_DELAY.subtitle, duration: 0.45 }}
            className="w-full max-w-3xl mx-auto mb-6 md:mb-8"
          >
            <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl px-5 md:px-8 py-5 md:py-6 shadow-[0_12px_32px_rgba(0,0,0,0.4)] overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 md:w-36 h-[2px] bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent" aria-hidden />
              <p
                className="relative text-slate-100 text-sm md:text-[17px] font-medium leading-7 md:leading-8"
                style={{ textWrap: 'pretty' } as React.CSSProperties}
              >
                {t('intro.descFull')}
              </p>
            </div>
          </motion.div>

          {/* Proof — three cards in calm sequence */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl mb-6 md:mb-8 text-right">
            {features.map((f, i) => (
              <FeatureCard key={i} feature={f} index={i} />
            ))}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: ENTER_DELAY.cta, duration: 0.4 }}
            className="w-full max-w-md"
          >
            <EntryButton
              label={isLoggedIn ? t('intro.continue') : t('intro.continueLogin')}
              onContinue={onContinue}
            />
            <p className="mt-3 text-[11px] text-white/45 font-medium">
              {t('intro.notOfficial')}
              {' · '}
              <a href="/privacy" className="underline hover:text-white/70 transition-colors">
                פרטיות
              </a>
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
