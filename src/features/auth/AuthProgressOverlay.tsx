/** Login verification/success choreography. Authentication remains page-owned. */
import { AnimatePresence, motion } from 'framer-motion';

type Props = { stage: 'verifying' | 'success' | null; leaving: boolean; welcomeName: string };

export default function AuthProgressOverlay({ stage: authOverlay, leaving: authLeaving, welcomeName }: Props) {
  return (
      <AnimatePresence>
        {authOverlay && (
          <motion.div
            key="auth-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950 overflow-hidden"
            dir="rtl"
          >
            {authLeaving && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.9, 0.45] }}
                transition={{ duration: 1.15, times: [0, 0.65, 1], ease: 'easeInOut' }}
                className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.9)_0%,rgba(250,204,21,0.45)_45%,rgba(250,204,21,0.12)_75%,transparent_100%)]"
                aria-hidden
              />
            )}
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px]" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-yellow-400/[0.08] rounded-full blur-3xl" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] bg-violet-600/[0.10] rounded-full blur-3xl" aria-hidden />
            </div>
            <motion.div
              className="relative flex flex-col items-center px-6"
              animate={authLeaving ? { opacity: [1, 1, 0], scale: [1, 1, 0.96] } : { opacity: 1, scale: 1 }}
              transition={authLeaving ? { duration: 1.15, times: [0, 0.55, 1], ease: [0.22, 1, 0.36, 1] } : { duration: 0.4 }}
            >
              <div className="relative w-36 h-36 flex items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full border border-dashed border-yellow-400/40"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                  aria-hidden
                />
                <motion.div
                  className="absolute inset-3 rounded-full border border-violet-400/30"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  aria-hidden
                />
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-full bg-yellow-400/15 blur-2xl"
                  aria-hidden
                />
                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-[0_0_50px_rgba(250,204,21,0.35)] relative border-2 border-yellow-300/60 overflow-hidden">
                  <img src="/logoref.png" alt="שופט וירטואלי" className="w-16 h-16 object-contain" />
                </div>
                <AnimatePresence>
                  {authOverlay === 'success' && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 }}
                      className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full bg-gradient-to-b from-yellow-300 to-yellow-500 flex items-center justify-center shadow-[0_0_24px_rgba(250,204,21,0.6)] border-2 border-slate-950"
                    >
                      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#020617" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.25 }} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
                {authOverlay === 'success' && (
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0.8 }}
                    animate={{ scale: 1.7, opacity: 0 }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-full border-2 border-yellow-400 pointer-events-none"
                    aria-hidden
                  />
                )}
              </div>
              <div className="mt-7 min-h-[3.5rem] flex flex-col items-center text-center">
                {authOverlay === 'verifying' ? (
                  <>
                    <p className="text-white font-black text-lg">מתחבר...</p>
                    <div className="flex gap-1.5 mt-3" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-2 h-2 rounded-full bg-yellow-400"
                          animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.15, 0.8] }}
                          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                          style={i === 1 ? { backgroundColor: '#a78bfa' } : undefined}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="flex flex-col items-center"
                  >
                    <p className="text-xl font-black bg-gradient-to-b from-white to-yellow-200 bg-clip-text text-transparent">ברוך הבא{welcomeName ? `, ${welcomeName}` : ''}!</p>
                    <p className="text-slate-400 text-sm font-bold mt-1.5">נכנסים לשופט הווירטואלי...</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
