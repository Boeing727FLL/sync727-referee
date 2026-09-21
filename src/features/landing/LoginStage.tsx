/**
 * LoginStage — the login form, inline on the landing page. When the intro's
 * CTA flips the landing to its login stage, the association system folds
 * away and this panel arrives in the same motion language: two hairlines
 * converge to a node above the card, then the content stages in. Same page,
 * same backdrop, no route change — the Apple-style continuity the intro
 * promised. Auth itself lives in useLoginAuth (shared with the /login
 * route); on success the caller navigates.
 */

import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useLoginAuth } from '../auth/useLoginAuth';
import { exitResetView, showResetView, toggleSignMode } from '../auth/loginFlow';
import AuthProgressOverlay from '../auth/AuthProgressOverlay';
import MaintenanceScreen from '../../components/MaintenanceScreen';

const LABEL_CLASS = 'block text-xs font-bold text-white/50 mb-1.5 text-right';
const INPUT_CLASS = 'w-full bg-white/[0.04] border border-white/[0.12] rounded-xl px-4 py-3 text-white text-base md:text-sm placeholder-white/25 focus:outline-none focus:border-mint-300/60 focus:ring-2 focus:ring-[rgba(159,216,198,0.25)] transition-all';
const INPUT_ICON_CLASS = INPUT_CLASS + ' pl-11';
const FORM_ERROR_CLASS = 'p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium leading-relaxed text-right';

/** Two hairlines leaving the logo's direction and meeting at one node. */
function FoldMark() {
  return (
    <svg viewBox="0 0 120 44" className="w-[120px] h-[44px] mx-auto mb-1" aria-hidden>
      <path d="M18 2 Q 34 30 60 36" pathLength="1" strokeDasharray="1" strokeDashoffset="1" className="login-line" style={{ animationDelay: '0.15s' }} />
      <path d="M102 2 Q 86 30 60 36" pathLength="1" strokeDasharray="1" strokeDashoffset="1" className="login-line" style={{ animationDelay: '0.3s' }} />
      <circle cx="60" cy="36" r="3" fill="#ff7a6b" className="login-node" style={{ animationDelay: '0.75s' }} />
    </svg>
  );
}

export default function LoginStage({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const {
    view, setView, isSignUp, showReset,
    email, setEmail, password, setPassword, name, setName,
    resetEmail, setResetEmail, showPassword, setShowPassword,
    loading, error, setError, resetSent, setResetSent,
    authOverlay, authLeaving, welcomeName,
    gated, handleSecretTap,
    handleSubmit, handleResetPassword,
  } = useLoginAuth({ onSuccess });

  return (
    <div className="absolute inset-0 z-[10001] pointer-events-none" dir="rtl">
      <div className="absolute left-1/2 -translate-x-1/2 w-[min(92vw,400px)]" style={{ top: '36%' }}>
        <div className="max-h-[58vh] overflow-y-auto pointer-events-auto">
          {gated ? (
            <div className="login-stage"><MaintenanceScreen onLogoTap={handleSecretTap} /></div>
          ) : (
            <>
              <FoldMark />
              <div className="login-stage border border-white/[0.09] bg-white/[0.03] backdrop-blur-xl rounded-2xl px-5 py-5 md:px-6 md:py-6" style={{ animationDelay: '0.45s' }}>
                {showReset ? (
                  <>
                    <h1 className="login-stage text-xl font-black text-white text-center mb-1" style={{ animationDelay: '0.55s' }}>איפוס סיסמה</h1>
                    <p className="login-stage text-white/45 text-xs text-center mb-5" style={{ animationDelay: '0.65s' }}>
                      הזן את האימייל שלך ונשלח לך קישור לאיפוס הסיסמה
                    </p>
                    {resetSent ? (
                      <div className="login-stage flex flex-col items-center gap-3 py-3" style={{ animationDelay: '0.1s' }}>
                        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                        <p className="text-emerald-400 font-bold text-sm text-center">נשלח אימייל איפוס לכתובת {resetEmail}</p>
                        <p className="text-white/45 text-xs text-center">בדוק את תיבת הדואר שלך (כולל ספאם) ולחץ על הקישור לאיפוס הסיסמה</p>
                        <button
                          onClick={() => { setView(exitResetView()); setResetSent(false); setResetEmail(''); setError(null); }}
                          className="mt-1 text-yellow-400 hover:text-yellow-300 text-sm font-bold cursor-pointer transition-colors"
                        >
                          חזרה להתחברות
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="login-stage" style={{ animationDelay: '0.75s' }}>
                          <label className={LABEL_CLASS}>אימייל</label>
                          <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="your@email.com" required className={INPUT_ICON_CLASS} dir="ltr" />
                          </div>
                        </div>
                        {error && <div className={FORM_ERROR_CLASS}>{error}</div>}
                        <div className="login-stage" style={{ animationDelay: '0.85s' }}>
                          <button type="submit" disabled={loading} className="w-full text-white font-black py-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm border-b border-yellow-400/60 hover:border-yellow-300 transition-colors">
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>שלח קישור לאיפוס</span>}
                          </button>
                          <div className="text-center mt-3">
                            <button type="button" onClick={() => { setView(exitResetView()); setError(null); }} className="text-white/45 hover:text-white text-xs font-bold cursor-pointer transition-colors">
                              חזרה להתחברות
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <>
                    <h1 className="login-stage text-xl font-black text-white text-center mb-1" style={{ animationDelay: '0.55s' }}>
                      {isSignUp ? 'יצירת חשבון' : 'התחברות'}
                    </h1>
                    <p className="login-stage text-white/45 text-xs text-center mb-5" style={{ animationDelay: '0.65s' }}>
                      {isSignUp ? 'צור חשבון כדי להשתמש בשופט הווירטואלי' : 'התחבר עם אימייל וסיסמה'}
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {isSignUp && (
                        <div className="login-stage" style={{ animationDelay: '0.7s' }}>
                          <label className={LABEL_CLASS}>שם מלא</label>
                          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="השם שלך" className={INPUT_CLASS + ' text-right'} dir="auto" />
                        </div>
                      )}
                      <div className="login-stage" style={{ animationDelay: '0.75s' }}>
                        <label className={LABEL_CLASS}>אימייל</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required className={INPUT_ICON_CLASS} dir="ltr" />
                        </div>
                      </div>
                      <div className="login-stage" style={{ animationDelay: '0.82s' }}>
                        <label className={LABEL_CLASS}>סיסמה</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className={INPUT_ICON_CLASS} dir="ltr" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 cursor-pointer transition-colors" aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}>
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {error && <div className={FORM_ERROR_CLASS}>{error}</div>}
                      <div className="login-stage" style={{ animationDelay: '0.9s' }}>
                        <button type="submit" disabled={loading} className="w-full text-white font-black py-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 text-[15px] transition-colors">
                          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="border-b border-yellow-400/60 hover:border-yellow-300 transition-colors pb-1">{isSignUp ? 'צור חשבון' : 'התחבר'}</span>}
                        </button>
                        <div className="flex items-center justify-between mt-3 text-xs font-bold">
                          <button type="button" onClick={() => { setView(showResetView()); setError(null); }} className="text-white/45 hover:text-white cursor-pointer transition-colors">
                            שכחתי סיסמה
                          </button>
                          <button type="button" onClick={() => { setView(toggleSignMode(view)); setError(null); }} className="text-white/45 hover:text-white cursor-pointer transition-colors">
                            {isSignUp ? 'כבר יש לי חשבון' : 'צור חשבון חדש'}
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                )}
                <div className="login-stage text-center mt-4" style={{ animationDelay: '1s' }}>
                  <button type="button" onClick={onBack} className="text-white/35 hover:text-white/70 text-[11px] font-bold cursor-pointer transition-colors">
                    חזרה
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="pointer-events-auto">
        <AuthProgressOverlay stage={authOverlay} leaving={authLeaving} welcomeName={welcomeName} />
      </div>
    </div>
  );
}
