/**
 * V12AuthForm - sign-in / sign-up / reset inside the v12 glass card.
 * All auth behavior stays in useLoginAuth; this file only owns the look,
 * the diagonal panel sweeps and the referee's reactions.
 */
import { useEffect, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLoginAuth } from '../auth/useLoginAuth';
import { exitResetView, showResetView, toggleSignMode, type LoginView } from '../auth/loginFlow';
import MaintenanceScreen from '../../components/MaintenanceScreen';
import { useLanguage } from '../../hooks/useLanguage';
import type { BuddyApi, SweepFn } from './V12Landing';

type Props = { buddy: BuddyApi; sweep: SweepFn; onSuccess: () => void };

export default function V12AuthForm({ buddy, sweep, onSuccess }: Props) {
  const { t, isRTL } = useLanguage();
  const {
    view, setView, isSignUp, showReset,
    email, setEmail, password, setPassword, name, setName,
    resetEmail, setResetEmail, showPassword, setShowPassword,
    loading, error, setError, resetSent, setResetSent,
    gated, handleSecretTap,
    handleSubmit, handleResetPassword,
  } = useLoginAuth({ onSuccess, handoff: 'inline' });

  // A failed attempt: the card shakes and the referee shakes his head.
  const lastError = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== lastError.current) { buddy.no(); buddy.say(t('login.oops'), 900); }
    lastError.current = error;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const go = (next: LoginView) => {
    const pos = next === 'signup' ? 'bottom' : 'top';
    sweep(pos, () => { setView(next); setError(null); });
  };
  const pwFocus = () => { if (!showPassword) { buddy.cover(true); buddy.say(t('login.noPeek'), 800); } };
  const pwBlur = () => buddy.cover(false);
  useEffect(() => { if (showPassword) buddy.cover(false); }, [showPassword]); // eslint-disable-line react-hooks/exhaustive-deps
  const lookField = () => buddy.look({ x: 30, y: 22 });
  const lookOff = () => buddy.look(null);

  if (gated) return <div className="fixed inset-0 z-[10050]"><MaintenanceScreen onLogoTap={handleSecretTap} /></div>;

  const pwField = (sm: boolean) => (
    <div className={`v12-f ${sm ? 'sm' : ''}`}>
      <input
        id="v12-pw" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
        placeholder="••••••••" required minLength={6} dir="ltr" autoComplete={isSignUp ? 'new-password' : 'current-password'}
        onFocus={pwFocus} onBlur={pwBlur}
      />
      <button type="button" className="v12-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}>
        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );

  if (showReset) return (
    <>
      <div className="v12-ph" dir={isRTL ? 'rtl' : 'ltr'}>
        <h2>{t('login.resetTitle')}</h2>
        <div className="s">{t('login.resetDesc')}</div>
      </div>
      {resetSent ? (
        <>
          <div className="v12-ok">{t('login.resetSent').replace('{email}', resetEmail)} {t('login.resetHint')}</div>
          <button type="button" className="v12-go" onClick={() => { setResetSent(false); setResetEmail(''); go(exitResetView()); }}>{t('login.backSignIn')}</button>
        </>
      ) : (
        <form onSubmit={handleResetPassword} dir={isRTL ? 'rtl' : 'ltr'}>
          <label className="v12-lbl" htmlFor="v12-re">{t('login.email')}</label>
          <div className="v12-f"><input id="v12-re" type="email" autoComplete="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="your@email.com" required dir="ltr" onFocus={lookField} onBlur={lookOff} /></div>
          {error && <div className="v12-err" role="alert">{error}</div>}
          <button type="submit" className="v12-go" disabled={loading}>{loading ? <span className="v12-ldt">{t('login.sending')}</span> : t('login.sendReset')}</button>
          <div className="v12-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="v12-tl" onClick={() => go(exitResetView())}>{t('login.backSignIn')}</button>
          </div>
        </form>
      )}
    </>
  );

  if (isSignUp) return (
    <form onSubmit={handleSubmit} dir={isRTL ? 'rtl' : 'ltr'}>
      <h3 className="v12-fh">{t('login.createAccount')}</h3>
      <label className="v12-lbl" htmlFor="v12-nm">{t('login.fullName')}</label>
      <div className="v12-f sm"><input id="v12-nm" type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('login.namePlaceholder')} dir="auto" autoComplete="name" onFocus={lookField} onBlur={lookOff} style={{ textAlign: isRTL ? 'right' : 'left' }} /></div>
      <label className="v12-lbl" htmlFor="v12-em">{t('login.email')}</label>
      <div className="v12-f sm"><input id="v12-em" type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required dir="ltr" onFocus={lookField} onBlur={lookOff} /></div>
      <label className="v12-lbl" htmlFor="v12-pw">{t('login.password')}</label>
      {pwField(true)}
      {error && <div className="v12-err" role="alert">{error}</div>}
      <button type="submit" className="v12-go" disabled={loading}>{loading ? <span className="v12-ldt">{t('login.creating')}</span> : t('login.createAccount')}</button>
      <div className="v12-pf">
        <h2>{t('login.start')}</h2>
        <button type="button" className="v12-lnk" onClick={() => go(toggleSignMode(view))}>{t('login.switchToSignIn')}</button>
      </div>
    </form>
  );

  return (
    <form onSubmit={handleSubmit} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="v12-ph" dir={isRTL ? 'rtl' : 'ltr'}>
        <h2>{t('login.welcome')}</h2>
        <div className="s">{t('app.cardSub')}</div>
        <button type="button" className="v12-lnk" onClick={() => go(toggleSignMode(view))}>{t('login.switchToSignUp')}</button>
      </div>
      <label className="v12-lbl" htmlFor="v12-em">{t('login.email')}</label>
      <div className="v12-f"><input id="v12-em" type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required dir="ltr" onFocus={lookField} onBlur={lookOff} /></div>
      <label className="v12-lbl" htmlFor="v12-pw">{t('login.password')}</label>
      {pwField(false)}
      {error && <div className="v12-err" role="alert">{error}</div>}
      <button type="submit" className="v12-go" disabled={loading}>{loading ? <span className="v12-ldt">{t('login.signingIn')}</span> : t('login.enter')}</button>
      <div className="v12-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="v12-tl" onClick={() => go(showResetView())}>{t('login.forgot')}</button>
      </div>
    </form>
  );
}
