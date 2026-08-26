import { motion } from 'framer-motion';
import { BookOpen, Scale, History } from 'lucide-react';

interface IntroScreenProps {
  hasGoogleToken: boolean;
  user: unknown;
  onContinue: () => void;
  t: (key: string) => string;
}

export default function IntroScreen({ hasGoogleToken, user, onContinue, t }: IntroScreenProps) {
  const isLoggedIn = Boolean(hasGoogleToken || user);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-y-auto no-scrollbar"
      dir="rtl"
    >
      {/* ===== Background — 16 real teams cutout (wide, visible behind CTA) ===== */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none bg-slate-950" aria-hidden>
        {/* tiny placeholder for instant paint (600 bytes) */}
        <img
          src="/bioglow-cutout-placeholder.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover object-center blur-[12px] scale-110 opacity-60"
          decoding="async"
        />
        <img
          src="/bioglow-cutout-3000.webp"
          srcSet="/bioglow-cutout-2x.webp 1500w, /bioglow-cutout-3000.webp 3000w"
          sizes="100vw"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          fetchPriority="high"
          decoding="sync"
          loading="eager"
        />
        {/* veil — very light at bottom so image stays visible behind CTA */}
        <div className="absolute inset-0 bg-slate-950/15" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-transparent to-slate-950/20" />
        {/* subtle top glow — cheap, no animation */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* ===== Content ===== */}
      <div className="relative z-10 flex flex-col min-h-full flex-1">
        {/* Header — sticky, moves with scroll as requested */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
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
                <span className="w-1 h-1 bg-primary rounded-full animate-pulse" aria-hidden />
              </div>
            </div>
          </div>
        </motion.div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 py-6 md:py-8 text-center w-full max-w-5xl mx-auto">
          {/* Logo — static, no 3D/orbit */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="relative mb-4 md:mb-5"
          >
            <div className="absolute -inset-6 bg-yellow-400/15 blur-2xl rounded-full pointer-events-none" aria-hidden />
            <div className="relative w-24 h-24 md:w-36 md:h-36 rounded-full bg-white border-2 border-slate-950 shadow-[0_8px_24px_rgba(0,0,0,0.25)] overflow-hidden flex items-center justify-center">
              <img
                src="/logoref.png"
                alt="שופט וירטואלי"
                className="w-[85%] h-[85%] object-contain select-none"
                draggable={false}
              />
            </div>
          </motion.div>

          {/* Badge — NOT official FIRST, community tool by Boeing 727 */}
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.35 }}
            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur text-yellow-300 text-[11px] md:text-xs font-bold px-4 py-1.5 rounded-full border border-yellow-400/25 mb-4 md:mb-5"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]" aria-hidden />
            {t('intro.badge')}
          </motion.span>

          {/* Title — simple, no per-word 3D */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.4 }}
            className="text-3xl md:text-6xl font-black text-white leading-tight mb-3 md:mb-4 tracking-tight"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            <span className="bg-gradient-to-b from-white to-white/80 bg-clip-text text-transparent">
              {t('intro.subtitle')}
            </span>
          </motion.h2>

          {/* Subtitle — Hebrew only, text-only (no photo scoring) */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.4 }}
            className="text-slate-200 text-sm md:text-lg font-medium leading-relaxed max-w-2xl mx-auto mb-6 md:mb-8"
            style={{ textWrap: 'pretty' } as React.CSSProperties}
          >
            {t('intro.descFull')}
          </motion.p>

          {/* 3 feature cards — text-only, lightweight */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl mb-6 md:mb-8 text-right"
          >
            {[
              { icon: BookOpen, title: t('intro.feature1Title'), desc: t('intro.feature1Desc') },
              { icon: Scale, title: t('intro.feature2Title'), desc: t('intro.feature2Desc') },
              { icon: History, title: t('intro.feature3Title'), desc: t('intro.feature3Desc') },
            ].map((f, i) => (
              <div
                key={i}
                className="bg-white/[0.06] backdrop-blur border border-white/10 rounded-2xl p-4 md:p-5 flex md:flex-col items-start md:items-center md:text-center gap-3 md:gap-3 hover:bg-white/[0.08] hover:border-white/15 transition-colors"
              >
                <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-yellow-400/15 border border-yellow-400/20 flex items-center justify-center text-yellow-400">
                  <f.icon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="flex-1 md:flex-none min-w-0">
                  <h4 className="text-sm md:text-[15px] font-black text-white leading-tight mb-1">{f.title}</h4>
                  <p className="text-xs md:text-xs text-slate-400 leading-relaxed font-medium">{f.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Disclaimer — compact, not big red box */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="w-full max-w-2xl mb-6 md:mb-8 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/15 text-center"
          >
            <p className="text-[11px] md:text-xs text-amber-200/80 leading-relaxed font-medium">
              <span className="font-black text-amber-300">{t('intro.disclaimer')}</span>{' '}
              {t('intro.disclaimerDesc')}
            </p>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.35 }}
            className="w-full max-w-md"
          >
            <button
              onClick={onContinue}
              className="w-full relative overflow-hidden group bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black py-4 md:py-4.5 px-6 rounded-2xl transition-all shadow-[0_10px_24px_rgba(250,204,21,0.25)] hover:shadow-[0_14px_32px_rgba(250,204,21,0.35)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-base md:text-lg"
            >
              <span className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent opacity-60 pointer-events-none" aria-hidden />
              <span className="relative">{isLoggedIn ? t('intro.continue') : t('intro.continueLogin')}</span>
              <span className="relative text-xl group-hover:translate-x-0.5 transition-transform" aria-hidden>
                ←
              </span>
            </button>
            <p className="mt-3 text-[11px] text-white/45 font-medium">
              {t('intro.notOfficial')}
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
