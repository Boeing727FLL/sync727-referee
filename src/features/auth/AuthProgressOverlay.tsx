/**
 * Login verification/success choreography. Authentication remains page-owned.
 *
 * Apple-like handoff on the site's own surface: the overlay lives on the
 * SAME SpatialBackdrop as the intro and the disclaimer, so the sequence
 * reads as one space. Departure is a soft dissolve, not a flash: the
 * success content blurs, shrinks and fades while the surface stays just
 * long enough to cover the swap into the disclaimer, which then springs
 * in as the next beat of the same motion.
 */
import { AnimatePresence, motion } from 'framer-motion';
import SpatialBackdrop from '../../components/SpatialBackdrop';

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
            className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden"
            dir="rtl"
          >
            <SpatialBackdrop />
            <div className="absolute inset-0 bg-[#020408]/80 pointer-events-none" aria-hidden />
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              {/* the intro's halo recipe, quiet */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full blur-3xl bg-[radial-gradient(closest-side,rgba(143,214,194,0.10)_0%,rgba(255,122,102,0.045)_55%,transparent_78%)]" />
            </div>
            <motion.div
              className="relative flex flex-col items-center px-6"
              animate={authLeaving
                ? { opacity: [1, 1, 0], scale: [1, 1, 0.94], filter: ['blur(0px)', 'blur(0px)', 'blur(10px)'] }
                : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={authLeaving ? { duration: 0.55, times: [0, 0.35, 1], ease: [0.22, 1, 0.36, 1] } : { duration: 0.4 }}
            >
              <div className="relative w-36 h-36 flex items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full border border-dashed border-white/20"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  aria-hidden
                />
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-2 rounded-full bg-[#8fd6c2]/10 blur-2xl"
                  aria-hidden
                />
                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-[0_18px_50px_rgba(0,0,0,0.55)] relative overflow-hidden">
                  <img src="/logoref.webp" alt="שופט וירטואלי" className="w-16 h-16 object-contain" />
                </div>
                <AnimatePresence>
                  {authOverlay === 'success' && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 17, delay: 0.08 }}
                      className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full bg-[#8fd6c2] flex items-center justify-center shadow-[0_6px_24px_rgba(143,214,194,0.35)] border-2 border-[#020408]"
                    >
                      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#020617" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.22 }} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-7 min-h-[3.5rem] flex flex-col items-center text-center">
                {authOverlay === 'verifying' ? (
                  <>
                    <p className="text-white font-black text-lg">מתחבר...</p>
                    <div className="flex gap-1.5 mt-3" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-2 h-2 rounded-full bg-white/70"
                          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.12, 0.8] }}
                          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                          style={i === 1 ? { backgroundColor: '#8fd6c2' } : undefined}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22, duration: 0.35 }}
                    className="flex flex-col items-center"
                  >
                    <p className="text-xl font-black text-white">ברוך הבא{welcomeName ? `, ${welcomeName}` : ''}!</p>
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
