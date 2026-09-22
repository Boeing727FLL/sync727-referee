/**
 * LoginPage — email/password entry to the Virtual Referee.
 *
 * FLOW (top to bottom):
 *   1. Form        — login / signup / password-reset, one card, animated swaps
 *   2. Verify      — "מתחבר..." overlay while Firebase answers
 *   3. Celebrate   — dark dissolve departure that navigates while the stage
 *                    is still opaque, so the route swap is invisible
 *   4. Gate        — during maintenance mode non-owners see MaintenanceScreen
 *                    (5 rapid logo taps reveal the form as an owner bypass)
 *
 * DESIGN: ChatGPT-clean minimal card on a dark premium stage, with Gemini
 * gradient accents (blue -> violet -> gold) and a sparkle mark.
 */


import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, KeyRound, CheckCircle2, Sparkles } from 'lucide-react';
import { exitResetView, showResetView, toggleSignMode } from '../features/auth/loginFlow';
import { useLoginAuth } from '../features/auth/useLoginAuth';
import MaintenanceScreen from '../components/MaintenanceScreen';
import AuthProgressOverlay from '../features/auth/AuthProgressOverlay';

// ---------------------------------------------------------------------------
// Constants & shared looks
// ---------------------------------------------------------------------------

/** One form label, right-aligned Hebrew. */
const LABEL_CLASS = 'block text-xs font-bold text-slate-400 mb-1.5 text-right';

/** One text input: 16px on phones (stops iOS auto-zoom), compact on desktop. */
const INPUT_CLASS = 'w-full bg-slate-800/80 border border-slate-700 rounded-2xl px-4 py-3.5 text-white text-base md:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_0_4px_rgba(250,204,21,0.12)] focus:bg-slate-800 transition-all';

/** Same input with room for a left-side icon. */
const INPUT_ICON_CLASS = 'w-full bg-slate-800/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white text-base md:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_0_4px_rgba(250,204,21,0.12)] focus:bg-slate-800 transition-all';

/** Red inline error box shared by all three forms. */
const FORM_ERROR_CLASS = 'p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium leading-relaxed text-right';

export default function LoginPage() {
  const navigate = useNavigate();

  const {
    view, setView, isSignUp, showReset,
    email, setEmail, password, setPassword, name, setName,
    resetEmail, setResetEmail, showPassword, setShowPassword,
    loading, error, setError, resetSent, setResetSent,
    authOverlay, authLeaving, welcomeName,
    gated, handleSecretTap,
    handleSubmit, handleResetPassword,
  } = useLoginAuth({ onSuccess: () => navigate('/app?enter=chat') });

  return (
    <div className="min-h-screen h-full bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Backdrop: FLL field + grid + FIRST glows, plus a Gemini violet aura */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <img
          src="/bioglow-table.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.14]"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/85 to-slate-950" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[380px] bg-yellow-400/[0.08] rounded-full blur-3xl" />
        <div className="absolute top-1/4 right-[-120px] w-[380px] h-[380px] bg-violet-600/[0.10] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[420px] h-[280px] bg-blue-600/[0.12] rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-0 w-[300px] h-[300px] bg-red-600/[0.08] rounded-full blur-3xl" />
        {/* Vignette for depth */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,6,23,0.7)_100%)]" />
      </div>
      {/* Referee Ribbon - slim identity strip */}
      <div className="h-2 bg-[repeating-linear-gradient(45deg,#000000,#000000_12px,#facc15_12px,#facc15_24px,#ffffff_24px,#ffffff_36px)] w-full shrink-0 relative z-10" />
      {/* Breathing gold aura behind the card */}
      <motion.div
        className="absolute left-1/2 top-1/2 w-[560px] max-w-[92vw] h-[560px] rounded-full bg-yellow-400/[0.07] blur-3xl pointer-events-none"
        style={{ x: '-50%', y: '-50%' }}
        aria-hidden
        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Card - fades out when success animation starts */}
      <motion.div
        animate={{
          opacity: authOverlay ? 0 : 1,
          scale: authOverlay ? 0.95 : 1,
        }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 flex flex-col items-center justify-center gap-3 p-4"
      >
        {gated && <MaintenanceScreen onLogoTap={handleSecretTap} />}
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(250,204,21,0.06)] rounded-[28px] w-full max-w-md relative overflow-hidden">
          {/* Gemini gradient hairline: blue -> violet -> gold */}
          <div className="absolute top-0 left-8 right-8 h-[3px] bg-gradient-to-l from-blue-400 via-violet-500 to-yellow-400 rounded-full" />
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-40 bg-yellow-400/[0.08] rounded-full blur-3xl pointer-events-none" aria-hidden />

          <button
            onClick={() => navigate('/')}
            className="absolute top-4 right-4 text-slate-300 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/10 border border-white/10 transition-all text-xs font-bold cursor-pointer flex items-center gap-1 z-10"
          >
            <ArrowRight className="w-3 h-3" />
            <span>חזרה</span>
          </button>

          {/* Gemini sparkle mark */}
          <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-violet-500/15 border border-violet-400/30 flex items-center justify-center z-10" aria-hidden>
            <Sparkles className="w-4 h-4 text-violet-300" />
          </div>

          <div className="p-6 md:p-8 pt-14">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute -inset-3 bg-yellow-400/20 blur-2xl rounded-full pointer-events-none" aria-hidden />
              <div className="relative w-16 h-16 bg-white rounded-full flex items-center justify-center ring-2 ring-yellow-400/70 shadow-[0_0_36px_rgba(250,204,21,0.35)] overflow-hidden">
                {showReset ? <KeyRound className="w-7 h-7 text-slate-900" /> : <img src="/logoref.webp" alt="שופט וירטואלי" className="w-11 h-11 object-contain" />}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {showReset ? (
                <motion.div
                  key="reset"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <h1 className="text-2xl font-black text-white text-center mb-1">איפוס סיסמה</h1>
                  <p className="text-slate-400 text-sm text-center mb-6">
                    הזן את האימייל שלך ונשלח לך קישור לאיפוס הסיסמה
                  </p>

                  {resetSent ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-4 py-4"
                    >
                      <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                      <p className="text-emerald-400 font-bold text-sm text-center">
                        נשלח אימייל איפוס לכתובת {resetEmail}
                      </p>
                      <p className="text-slate-400 text-xs text-center">
                        בדוק את תיבת הדואר שלך (כולל ספאם) ולחץ על הקישור לאיפוס הסיסמה
                      </p>
                      <button
                        onClick={() => {
                          setView(exitResetView());
                          setResetSent(false);
                          setResetEmail('');
                          setError(null);
                        }}
                        className="mt-2 text-yellow-400 hover:text-yellow-300 text-sm font-bold cursor-pointer transition-colors"
                      >
                        חזרה להתחברות
                      </button>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                      <div>
                        <label className={LABEL_CLASS}>אימייל</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className={INPUT_ICON_CLASS}
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={FORM_ERROR_CLASS}
                        >
                          {error}
                        </motion.div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/50 text-slate-950 font-black py-3.5 px-4 rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <span>שלח קישור לאיפוס</span>
                        )}
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setView(exitResetView());
                            setError(null);
                          }}
                          className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer transition-colors"
                        >
                          חזרה להתחברות
                        </button>
                      </div>
                    </form>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <h1 className="text-2xl font-black text-center mb-1 bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">
                    {isSignUp ? 'יצירת חשבון' : 'התחברות'}
                  </h1>
                  <p className="text-slate-400 text-sm text-center mb-4">
                    {isSignUp
                      ? 'צור חשבון כדי להשתמש בשופט הווירטואלי'
                      : 'התחבר עם אימייל וסיסמה'}
                  </p>
                  <div className="flex items-center gap-2 mb-6" aria-hidden>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent to-violet-400/40" />
                    <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-blue-400 via-violet-400 to-yellow-400" />
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent to-violet-400/40" />
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <AnimatePresence mode="wait">
                      {isSignUp && (
                        <motion.div
                          key="name"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <label className={LABEL_CLASS}>שם מלא</label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="השם שלך"
                            className={`${INPUT_CLASS} text-right`}
                            dir="auto"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                        <label className={LABEL_CLASS}>אימייל</label>
                        <div className="relative group">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-yellow-400 transition-colors" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className={INPUT_ICON_CLASS}
                            dir="ltr"
                          />
                        </div>
                    </div>

                    <div>
                        <label className={LABEL_CLASS}>סיסמה</label>
                        <div className="relative group">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-yellow-400 transition-colors" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="********"
                            required
                            minLength={6}
                            className={INPUT_ICON_CLASS}
                            dir="ltr"
                          />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={FORM_ERROR_CLASS}
                      >
                        {error}
                      </motion.div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 disabled:from-yellow-400/50 disabled:to-yellow-500/50 text-slate-950 font-black py-4 px-4 rounded-2xl transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-[15px] shadow-[0_8px_24px_rgba(250,204,21,0.3)] hover:shadow-[0_12px_32px_rgba(250,204,21,0.4)] disabled:shadow-none"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <span>{isSignUp ? 'צור חשבון' : 'היכנס'}</span>
                      )}
                    </button>

                    {!isSignUp && (
                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setView(showResetView());
                            setError(null);
                          }}
                          className="text-yellow-400/70 hover:text-yellow-300 text-xs font-bold cursor-pointer transition-colors"
                        >
                          שכחתי סיסמה
                        </button>
                      </div>
                    )}
                  </form>

                  <div className="mt-5 text-center">
                    <button
                      onClick={() => {
                        setView(toggleSignMode(view));
                        setError(null);
                      }}
                      className="text-sm font-bold cursor-pointer transition-colors bg-gradient-to-l from-blue-300 via-violet-300 to-yellow-300 bg-clip-text text-transparent hover:opacity-80"
                    >
                      {isSignUp ? 'כבר יש לך חשבון? התחבר' : 'אין לך חשבון? הירשם'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <AuthProgressOverlay stage={authOverlay} leaving={authLeaving} welcomeName={welcomeName} />

      {/* Boeing 727 credit */}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 pointer-events-none" aria-hidden>
        <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-4 w-auto object-contain opacity-70" />
        <span className="text-[11px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727</span>
      </div>

    </div>
  );
}
