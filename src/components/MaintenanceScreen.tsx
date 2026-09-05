import { motion } from 'framer-motion';
import { Wrench, Clock, Sparkles } from 'lucide-react';

// Full-takeover screen shown to everyone except the owner while work mode
// is on. Rendered above everything (z-11000), no buttons, nothing to do
// but wait.
const CARDS = [
  {
    icon: Wrench,
    title: 'מה קורה',
    text: 'קבוצת Boeing 727 משפרת את השופט ממש עכשיו, לכן האפליקציה סגורה זמנית.',
  },
  {
    icon: Clock,
    title: 'מה עושים',
    text: 'אין מה לעשות. פשוט לחזור בעוד כמה דקות ולרענן את העמוד.',
  },
  {
    icon: Sparkles,
    title: 'מה מחכה',
    text: 'גרסה טובה ומדויקת יותר ברגע שהעבודות מסתיימות.',
  },
];

export default function MaintenanceScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[11000] bg-slate-950 flex flex-col overflow-y-auto"
      dir="rtl"
      role="status"
    >
      {/* Referee ribbon */}
      <div className="h-2 bg-[repeating-linear-gradient(45deg,#000000,#000000_12px,#facc15_12px,#facc15_24px,#ffffff_24px,#ffffff_36px)] w-full shrink-0" aria-hidden />

      <div className="relative flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-8 text-center overflow-hidden">
        {/* Backdrop: faint field + glows */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <img
            src="/bioglow-table.jpg"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-[0.08]"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/85 to-slate-950" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px]" />
          <div className="absolute left-1/2 top-24 -translate-x-1/2 w-[480px] h-[280px] bg-yellow-400/[0.08] rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[200px] bg-blue-600/[0.08] rounded-full blur-3xl" />
        </div>

        <div className="relative flex flex-col items-center w-full max-w-lg">
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-24 h-24 md:w-28 md:h-28 mb-5 md:mb-6"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -inset-4 bg-yellow-400/20 blur-2xl rounded-full pointer-events-none"
              aria-hidden
            />
            <div className="absolute -inset-1.5 rounded-full border border-yellow-400/25 pointer-events-none" aria-hidden />
            <div className="relative w-full h-full rounded-full bg-white ring-2 ring-yellow-400/70 shadow-[0_0_44px_rgba(250,204,21,0.4)] overflow-hidden flex items-center justify-center">
              <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain" />
            </div>
            <div className="absolute -bottom-1 -left-1 w-10 h-10 rounded-full bg-gradient-to-b from-yellow-300 to-yellow-500 flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.5)] border-2 border-slate-950">
              <Wrench className="w-4 h-4 text-slate-950" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <span className="inline-flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/30 rounded-full px-4 py-1.5 text-[11px] md:text-xs font-bold text-yellow-300">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" aria-hidden />
              עבודות תחזוקה
            </span>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mt-4">
              אנחנו בעבודות
            </h1>
            <div className="flex items-center justify-center gap-3 mt-4" aria-hidden>
              <div className="h-[1px] w-10 bg-gradient-to-r from-transparent to-white/20" />
              <div className="w-20 h-[2.5px] bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 rounded-full shadow-[0_0_12px_rgba(250,204,21,0.5)]" />
              <div className="h-[1px] w-10 bg-gradient-to-l from-transparent to-white/20" />
            </div>
            <p className="text-sm md:text-base text-slate-400 font-medium mt-4 leading-relaxed">
              השופט הווירטואלי עובר שדרוג כרגע. סליחה על ההפרעה, חוזרים ממש בקרוב.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 md:gap-3 mt-6 md:mt-8 w-full text-right"
          >
            {CARDS.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.08, duration: 0.35 }}
                className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex sm:flex-col items-start sm:items-center sm:text-center gap-3"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-yellow-400/15 border border-yellow-400/25 flex items-center justify-center text-yellow-300">
                  <c.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-white leading-tight mb-1">{c.title}</h2>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">{c.text}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <div className="flex gap-1.5 mt-6 md:mt-8" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-2 h-2 rounded-full bg-yellow-400"
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2">
            <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-4 w-auto object-contain opacity-70" />
            <span className="text-[11px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
