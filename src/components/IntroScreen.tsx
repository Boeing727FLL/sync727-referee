import { motion } from 'framer-motion';
import { MessageCircle, Smartphone, FileCheck } from 'lucide-react';

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
      {/* ===== Background — fixed, always covers viewport (no gap below CTA) ===== */}
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
        <div className="absolute inset-0 bg-slate-950/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/15 to-slate-950/40" />
        {/* subtle top glow — cheap, no animation */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>
      {/* ===== Content ===== */}
      <div className="relative z-10 flex flex-col min-h-full flex-1">
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
          {/* Logo — premium gold frame, competition energy + quiet luxury */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="relative mb-5 md:mb-6 group"
          >
            {/* outer glow */}
            <div className="absolute -inset-8 bg-gradient-to-b from-yellow-400/25 via-amber-500/15 to-transparent blur-2xl rounded-full pointer-events-none" aria-hidden />
            <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-yellow-300/30 via-transparent to-amber-500/20 blur-sm pointer-events-none" aria-hidden />
            {/* gold frame */}
            <div className="relative w-28 h-28 md:w-40 md:h-40 rounded-full p-[3px] bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-600 shadow-[0_8px_32px_rgba(250,204,21,0.4),0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden relative shadow-[inset_0_2px_12px_rgba(0,0,0,0.08)]">
                <img
                  src="/logoref.png"
                  alt="שופט וירטואלי"
                  className="w-[84%] h-[84%] object-contain select-none relative z-10"
                  draggable={false}
                />
                {/* inner highlight */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/40 via-transparent to-transparent opacity-60 pointer-events-none" aria-hidden />
                {/* shine sweep */}
                <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none" aria-hidden>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out opacity-0 group-hover:opacity-100" />
                </div>
              </div>
            </div>
            {/* thin outer ring */}
            <div className="absolute -inset-1.5 rounded-full border border-yellow-400/20 pointer-events-none" aria-hidden />
          </motion.div>

          {/* Badge — premium glass pill */}
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.35 }}
            className="inline-flex items-center gap-2 bg-slate-900/50 backdrop-blur-xl text-yellow-300 text-[11px] md:text-xs font-bold px-4 md:px-5 py-1.5 md:py-2 rounded-full border border-yellow-400/30 shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] mb-5 md:mb-6"
          >
            <span className="relative w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]" aria-hidden>
              <span className="absolute inset-0 rounded-full bg-yellow-400 animate-ping opacity-30" aria-hidden />
            </span>
            {t('intro.badge')}
          </motion.span>

          {/* Title — premium, competition energy */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.45 }}
            className="mb-3 md:mb-4"
          >
            <h2
              className="text-3xl md:text-6xl font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.5)]"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              {t('intro.subtitle')}
            </h2>
            {/* gold underline + side fades - quiet luxury */}
            <div className="flex items-center justify-center gap-3 mt-3 md:mt-4">
              <div className="h-[1px] w-8 md:w-12 bg-gradient-to-r from-transparent to-white/20" aria-hidden />
              <div className="w-16 md:w-24 h-[2.5px] bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 rounded-full shadow-[0_0_12px_rgba(250,204,21,0.5)]" aria-hidden />
              <div className="h-[1px] w-8 md:w-12 bg-gradient-to-l from-transparent to-white/20" aria-hidden />
            </div>
          </motion.div>

          {/* Subtitle — wide card but not too wide, premium glass */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.45 }}
            className="w-full max-w-3xl mx-auto mb-6 md:mb-8"
          >
            <div className="relative bg-slate-900/35 backdrop-blur-xl border border-white/10 rounded-2xl px-5 md:px-8 py-5 md:py-6 shadow-[0_12px_32px_rgba(0,0,0,0.4)] overflow-hidden">
              {/* top gold accent */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 md:w-36 h-[2px] bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent" aria-hidden />
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] via-transparent to-transparent pointer-events-none" aria-hidden />
              {/* subtle quote watermark */}
              <div className="absolute -top-2 -right-2 text-6xl font-black text-white/[0.04] select-none pointer-events-none leading-none" aria-hidden>
                “
              </div>
              <p
                className="relative text-white/92 text-sm md:text-[17px] font-semibold leading-7 md:leading-8"
                style={{ textWrap: 'pretty' } as React.CSSProperties}
              >
                {t('intro.descFull')}
              </p>
            </div>
          </motion.div>

          {/* 3 feature cards — text-only, lightweight */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl mb-6 md:mb-8 text-right"
          >
            {[
              { icon: MessageCircle, title: t('intro.feature1Title'), desc: t('intro.feature1Desc') },
              { icon: Smartphone, title: t('intro.feature2Title'), desc: t('intro.feature2Desc') },
              { icon: FileCheck, title: t('intro.feature3Title'), desc: t('intro.feature3Desc') },
            ].map((f, i) => (
              <div
                key={i}
                className="bg-slate-900/70 backdrop-blur-xl border border-white/15 rounded-2xl p-4 md:p-5 flex md:flex-col items-start md:items-center md:text-center gap-3 md:gap-3 hover:bg-slate-900/80 hover:border-white/20 transition-colors shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              >
                <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-yellow-400/20 border border-yellow-400/25 flex items-center justify-center text-yellow-400">
                  <f.icon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="flex-1 md:flex-none min-w-0">
                  <h4 className="text-sm md:text-[15px] font-black text-white leading-tight mb-1">{f.title}</h4>
                  <p className="text-xs md:text-xs text-slate-200 leading-relaxed font-medium">{f.desc}</p>
                </div>
              </div>
            ))}
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
