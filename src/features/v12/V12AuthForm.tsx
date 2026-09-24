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
  const { t } = useLanguage();
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
    if (error && error !== lastError.current) { buddy.no(); buddy.say('אופס!', 900); }
    lastError.current = error;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const go = (next: LoginView) => {
    const pos = next === 'signup' ? 'bottom' : 'top';
    sweep(pos, () => { setView(next); setError(null); });
  };
  const pwFocus = () => { if (!showPassword) { buddy.cover(true); buddy.say('לא מציץ!', 800); } };
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
      <button type="button" className="v12-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}>
        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );

  if (showReset) return (
    <>
      <div className="v12-ph">
        <h2>איפוס סיסמה.</h2>
        <div className="s">נשלח לך קישור לאיפוס במייל</div>
      </div>
      {resetSent ? (
        <>
          <div className="v12-ok">נשלח אימייל איפוס לכתובת {resetEmail}. בדקו את תיבת הדואר (כולל ספאם) ולחצו על הקישור.</div>
          <button type="button" className="v12-go" onClick={() => { setResetSent(false); setResetEmail(''); go(exitResetView()); }}>חזרה להתחברות</button>
        </>
      ) : (
        <form onSubmit={handleResetPassword}>
          <label className="v12-lbl" htmlFor="v12-re">אימייל</label>
          <div className="v12-f"><input id="v12-re" type="email" autoComplete="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="your@email.com" required dir="ltr" onFocus={lookField} onBlur={lookOff} /></div>
          {error && <div className="v12-err" role="alert">{error}</div>}
          <button type="submit" className="v12-go" disabled={loading}>{loading ? <span className="v12-ldt">שולחים…</span> : 'שליחת קישור'}</button>
          <div className="v12-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="v12-tl" onClick={() => go(exitResetView())}>חזרה להתחברות</button>
          </div>
        </form>
      )}
    </>
  );

  if (isSignUp) return (
    <form onSubmit={handleSubmit}>
      <h3 className="v12-fh">יצירת חשבון</h3>
      <label className="v12-lbl" htmlFor="v12-nm">שם</label>
      <div className="v12-f sm"><input id="v12-nm" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="השם שלך" dir="auto" autoComplete="name" onFocus={lookField} onBlur={lookOff} style={{ textAlign: 'right' }} /></div>
      <label className="v12-lbl" htmlFor="v12-em">אימייל</label>
      <div className="v12-f sm"><input id="v12-em" type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required dir="ltr" onFocus={lookField} onBlur={lookOff} /></div>
      <label className="v12-lbl" htmlFor="v12-pw">סיסמה</label>
      {pwField(true)}
      {error && <div className="v12-err" role="alert">{error}</div>}
      <button type="submit" className="v12-go" disabled={loading}>{loading ? <span className="v12-ldt">יוצרים חשבון…</span> : 'יצירת חשבון'}</button>
      <div className="v12-pf">
        <h2>מתחילים.</h2>
        <button type="button" className="v12-lnk" onClick={() => go(toggleSignMode(view))}>יש לי חשבון</button>
      </div>
    </form>
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="v12-ph">
        <h2>ברוכים השבים.</h2>
        <div className="s">{t('app.cardSub')}</div>
        <button type="button" className="v12-lnk" onClick={() => go(toggleSignMode(view))}>אין חשבון? הרשמה</button>
      </div>
      <label className="v12-lbl" htmlFor="v12-em">אימייל</label>
      <div className="v12-f"><input id="v12-em" type="email" name="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required dir="ltr" onFocus={lookField} onBlur={lookOff} /></div>
      <label className="v12-lbl" htmlFor="v12-pw">סיסמה</label>
      {pwField(false)}
      {error && <div className="v12-err" role="alert">{error}</div>}
      <button type="submit" className="v12-go" disabled={loading}>{loading ? <span className="v12-ldt">מתחברים…</span> : 'כניסה'}</button>
      <div className="v12-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="v12-tl" onClick={() => go(showResetView())}>שכחתי סיסמה</button>
      </div>
    </form>
  );
}
