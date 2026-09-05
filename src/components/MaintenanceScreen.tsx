import { motion } from 'framer-motion';
import { Wrench } from 'lucide-react';

// Full-takeover screen shown to everyone except the owner while work mode
// is on. Rendered above everything (z-11000), no buttons, nothing to do
// but wait.
export default function MaintenanceScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[11000] bg-slate-950 flex flex-col items-center justify-center px-6 text-center overflow-hidden"
      dir="rtl"
      role="status"
    >
      {/* Backdrop: faint field + gold glow */}
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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-yellow-400/[0.07] rounded-full blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center max-w-md">
        <div className="relative w-20 h-20 mb-6">
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -inset-3 bg-yellow-400/20 blur-2xl rounded-full pointer-events-none"
            aria-hidden
          />
          <div className="relative w-20 h-20 rounded-full bg-white ring-2 ring-yellow-400/70 shadow-[0_0_36px_rgba(250,204,21,0.35)] overflow-hidden flex items-center justify-center">
            <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain" />
          </div>
          <div className="absolute -bottom-1 -left-1 w-9 h-9 rounded-full bg-gradient-to-b from-yellow-300 to-yellow-500 flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.5)] border-2 border-slate-950">
            <Wrench className="w-4 h-4 text-slate-950" />
          </div>
        </div>

        <h1 className="text-3xl font-black text-white tracking-tight">
          אנחנו בעבודות
        </h1>
        <p className="text-sm text-slate-400 font-medium mt-3 leading-relaxed">
          השופט הווירטואלי עובר שיפורים כרגע. חוזרים ממש בקרוב עם גרסה טובה יותר.
        </p>

        <div className="flex gap-1.5 mt-6" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-2 h-2 rounded-full bg-yellow-400"
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-4 w-auto object-contain opacity-70" />
          <span className="text-[11px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727</span>
        </div>
      </div>
    </motion.div>
  );
}
