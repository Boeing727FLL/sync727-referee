import { motion } from 'framer-motion';

// Opaque splash shown until a realtime gate flag (e.g. maintenance mode)
// is known, so the app underneath never flashes first. Topmost layer.
export default function BootSplash() {
  return (
    <div className="fixed inset-0 z-[12000] bg-slate-950 flex items-center justify-center" aria-hidden>
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative w-20 h-20 rounded-full bg-white ring-2 ring-yellow-400/70 shadow-[0_0_36px_rgba(250,204,21,0.35)] overflow-hidden flex items-center justify-center"
      >
        <img src="/logoref.png" alt="" className="w-full h-full object-contain" draggable={false} />
      </motion.div>
    </div>
  );
}
