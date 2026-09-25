/**
 * LoginStage — the login form, inline on the landing page. When the intro's
 * CTA flips the landing to its login stage, the association system folds
 * away around the gliding logo and the form materializes underneath in the
 * same motion language: no card, no decorative motif — the map's lines
 * become the form's own hairlines. Each field is a quiet underline row that
 * draws in from center (the map's line-draw applied functionally), mint on
 * focus, while title, fields and actions stage in with the intro's
 * fade-rise-blur entrance. Same page, same backdrop, no route change.
 * Auth itself lives in useLoginAuth (shared with the /login route); on
 * success the caller navigates.
 */

import { useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useLoginAuth } from '../auth/useLoginAuth';
import { exitResetView, showResetView, toggleSignMode } from '../auth/loginFlow';
import MaintenanceScreen from '../../components/MaintenanceScreen';

const LABEL_CLASS = 'block text-[11px] font-bold text-white/40 mb-1 text-start tracking-wide';
const INPUT_CLASS = 'w-full bg-transparent px-1 py-2 text-white text-base md:text-sm placeholder-white/25 focus:outline-none';
const INPUT_ICON_CLASS = INPUT_CLASS + ' pl-7';
const FORM_ERROR_CLASS = 'p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium leading-relaxed text-start';

export default function LoginStage({ onBack, onSuccess, onFailure }: { onBack: () => void; onSuccess: () => void; onFailure?: () => void }) {
  const { t, isRTL } = useLanguage();
  const {
    view, setView, isSignUp, showReset,
    email, setEmail, password, setPassword, name, setName,
    resetEmail, setResetEmail, showPassword, setShowPassword,
    loading, error, setError, resetSent, setResetSent,
    gated, handleSecretTap,
    handleSubmit, handleResetPassword,
  } = useLoginAuth({ onSuccess, handoff: 'inline' });
  // The inline handoff: no gather, no morph - on success the gate opens
  // directly over the stable form and the logo is cut where it stands.
  // A failed entry plays the orbit's red X instead of the small error box:
  // when the parent takes failure errors, consume them before they render.
  useEffect(() => {
    if (!error || showReset || !onFailure) return;
    setError(null);
    onFailure();
  }, [error, showReset, onFailure, setError]);
  const d = (entrance: string) => ({ animationDelay: entrance });

  return (
    <div className="absolute inset-0 z-[10001] pointer-events-none" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="login-anchor">
        <div className="login-scroll pointer-events-auto">
          {gated ? (
            <div className="login-stage"><MaintenanceScreen onLogoTap={handleSecretTap} /></div>
          ) : showReset ? (
            <>
              <h1 className="login-stage text-2xl font-black text-white text-center mb-1.5" style={{ animationDelay: '0.4s' }}>{t('login.resetTitle')}</h1>
              <p className="login-stage text-white/45 text-xs text-center mb-7" style={{ animationDelay: '0.5s' }}>
                {t('login.resetDesc')}
              </p>
              {resetSent ? (
                <div className="login-stage flex flex-col items-center gap-3 py-3" style={{ animationDelay: '0.1s' }}>
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  <p className="text-emerald-400 font-bold text-sm text-center">{t('login.resetSent').replace('{email}', resetEmail)}</p>
                  <p className="text-white/45 text-xs text-center">{t('login.resetHint')}</p>
                  <button
                    onClick={() => { setView(exitResetView()); setResetSent(false); setResetEmail(''); setError(null); }}
                    className="mt-1 text-yellow-400 hover:text-yellow-300 text-sm font-bold cursor-pointer transition-colors"
                  >
                    {t('login.backSignIn')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-6">
                  <div className="login-field login-stage pb-2" style={{ animationDelay: '0.6s' }}>
                    <label className={LABEL_CLASS}>{t('login.email')}</label>
                    <div className="relative">
                      <Mail className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input type="email" name="email" autoComplete="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="your@email.com" required className={INPUT_ICON_CLASS} dir="ltr" />
                    </div>
                  </div>
                  {error && <div className={FORM_ERROR_CLASS}>{error}</div>}
                  <div className="login-stage" style={{ animationDelay: '0.7s' }}>
                    <button type="submit" disabled={loading} className="w-full text-white font-black py-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 text-[15px] transition-colors">
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="border-b border-yellow-400/60 hover:border-yellow-300 transition-colors pb-1">{t('login.sendReset')}</span>}
                    </button>
                    <div className="text-center mt-4">
                      <button type="button" onClick={() => { setView(exitResetView()); setError(null); }} className="text-white/45 hover:text-white text-xs font-bold cursor-pointer transition-colors">
                        {t('login.backSignIn')}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </>
          ) : (
            <>
              <h1 data-orbit className="login-stage login-row text-2xl font-black text-white text-center mb-1.5" style={d('0.4s')}>
                {isSignUp ? t('login.signUp') : t('login.signIn')}
              </h1>
              <p className="login-stage login-row login-sub text-white/45 text-xs text-center mb-7" style={d('0.5s')}>
                {isSignUp ? t('login.signUpDesc') : t('login.signInDesc')}
              </p>
              <form onSubmit={handleSubmit} className="space-y-6">
                {isSignUp && (
                  <div data-orbit className="login-field login-stage login-row pb-2" style={d('0.55s')}>
                    <label className={LABEL_CLASS}>{t('login.fullName')}</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('login.namePlaceholder')} className={INPUT_CLASS + ' text-start'} dir="auto" />
                  </div>
                )}
                <div data-orbit className="login-field login-stage pb-2 login-row" style={d('0.62s')}>
                  <label className={LABEL_CLASS}>{t('login.email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required className={INPUT_ICON_CLASS} dir="ltr" />
                  </div>
                </div>
                <div data-orbit className="login-field login-stage pb-2 login-row" style={d('0.7s')}>
                  <label className={LABEL_CLASS}>{t('login.password')}</label>
                  <div className="relative">
                    <Lock className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className={INPUT_ICON_CLASS} dir="ltr" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 cursor-pointer transition-colors" aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {error && <div className={FORM_ERROR_CLASS + ' login-row'}>{error}</div>}
                {
                  <div className="login-stage login-row pt-3" style={d('0.8s')}>
                    <button type="submit" data-orbit disabled={loading} className="w-full text-white font-black py-2 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 text-[15px] transition-colors">
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="border-b border-yellow-400/60 hover:border-yellow-300 transition-colors pb-1">{isSignUp ? t('login.createAccount') : t('login.enter')}</span>}
                    </button>
                    <div className="flex items-center justify-between mt-4 text-xs font-bold">
                      <button type="button" onClick={() => { setView(showResetView()); setError(null); }} className="text-white/45 hover:text-white cursor-pointer transition-colors">
                        {t('login.forgot')}
                      </button>
                      <button type="button" onClick={() => { setView(toggleSignMode(view)); setError(null); }} className="text-white/45 hover:text-white cursor-pointer transition-colors">
                        {isSignUp ? t('login.switchToSignIn') : t('login.switchToSignUp')}
                      </button>
                    </div>
                  </div>
                }
              </form>
            </>
          )}
          <div className="login-stage login-row login-back text-center mt-6" style={d('0.95s')}>
            <button type="button" onClick={onBack} className="text-white/35 hover:text-white/70 text-[11px] font-bold cursor-pointer transition-colors">
              {t('login.back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
