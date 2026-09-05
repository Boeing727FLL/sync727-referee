import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { trackRefereeUser } from '../lib/analytics';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, KeyRound, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [authOverlay, setAuthOverlay] = useState<null | 'verifying' | 'success'>(null);
  const [authLeaving, setAuthLeaving] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const pendingAuthRef = useRef<{ email: string; password: string; isSignUp: boolean; name: string } | null>(null);
  const authTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = authTimersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  const later = (fn: () => void, ms: number) => {
    authTimersRef.current.push(setTimeout(fn, ms));
  };

  const doAuth = async (emailVal: string, passwordVal: string, isSignUpMode: boolean, nameVal: string): Promise<boolean> => {
    try {
      let uid: string;
      let userEmail: string;
      let displayName: string;

      if (isSignUpMode) {
        const result = await createUserWithEmailAndPassword(auth, emailVal, passwordVal);
        uid = result.user.uid;
        userEmail = result.user.email || emailVal;
        displayName = nameVal || emailVal.split('@')[0];

        await setDoc(doc(db, 'users', uid), {
          email: userEmail,
          name: displayName,
          createdAt: serverTimestamp(),
          role: 'member',
          uid,
        });

        // Registered users = users who actually signed up
        trackRefereeUser(uid);

        await result.user.reload();
      } else {
        const result = await signInWithEmailAndPassword(auth, emailVal, passwordVal);
        uid = result.user.uid;
        userEmail = result.user.email || emailVal;
        displayName = (await getDoc(doc(db, 'users', uid))).data()?.name || emailVal.split('@')[0];
      }

      localStorage.setItem('auth_user', JSON.stringify({
        uid,
        email: userEmail,
        name: displayName,
        picture: '',
        role: 'member',
        isAdmin: false,
      }));

      setLoading(false);
      return true;
    } catch (err: any) {
      setLoading(false);
      let msg: string;
      const code = err.code;
      if (code === 'auth/email-already-in-use') {
        msg = 'כבר קיים חשבון עם האימייל הזה. נסה להתחבר.';
      } else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        msg = 'אימייל או סיסמה שגויים.';
      } else if (code === 'auth/wrong-password') {
        msg = 'סיסמה שגויה.';
      } else if (code === 'auth/weak-password') {
        msg = 'הסיסמה חלשה מדי. נדרשים לפחות 6 תווים.';
      } else if (code === 'auth/invalid-email') {
        msg = 'כתובת אימייל לא תקינה.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.';
      } else {
        msg = err.message;
      }
      setError(msg);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    pendingAuthRef.current = { email, password, isSignUp, name };
    setAuthOverlay('verifying');
    setAuthLeaving(false);
    later(async () => {
      const pending = pendingAuthRef.current;
      if (!pending) return;
      setLoading(true);
      const authOk = await doAuth(pending.email, pending.password, pending.isSignUp, pending.name);
      if (authOk) {
        const fbUid = auth.currentUser?.uid || 'anon';
        trackRefereeUser(fbUid);
        setWelcomeName(pending.name || pending.email.split('@')[0]);
        setAuthOverlay('success');
        // Golden veil departure (~2.2s of light): content softly recedes while
        // a warm gold veil blooms from the center. Navigate inside the veil
        // so the swap is invisible, and the chat-side reveal continues it.
        later(() => {
          setAuthLeaving(true);
          later(() => navigate('/?enter=chat'), 1150);
        }, 1600);
      } else {
        setAuthOverlay(null);
      }
    }, 650);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    const emailTrim = resetEmail.trim();
    if (!emailTrim) {
      setError('נא להזין כתובת אימייל.');
      return;
    }
    setLoading(true);
    // Ensure email is sent in Hebrew
    auth.languageCode = 'he';

    const tryWithActionCode = async () => {
      await sendPasswordResetEmail(auth, emailTrim, {
        url: `${window.location.origin}/`,
        handleCodeInApp: false,
      });
    };

    try {
      try {
        await tryWithActionCode();
      } catch (inner: any) {
        const code = inner?.code || '';
        // New project may not have the continue URL whitelisted yet — fallback to plain reset
        if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri' || code === 'auth/missing-continue-uri') {
          console.warn('continueUrl not whitelisted, falling back to default handler:', inner);
          await sendPasswordResetEmail(auth, emailTrim);
        } else {
          throw inner;
        }
      }
      setResetSent(true);
    } catch (err: any) {
      const code = err?.code || '';
      // With Email Enumeration Protection, user-not-found is hidden — treat as success
      if (code === 'auth/user-not-found') {
        // Don't leak existence — still show success
        setResetSent(true);
      } else if (code === 'auth/invalid-email') {
        setError('כתובת אימייל לא תקינה.');
      } else if (code === 'auth/too-many-requests') {
        setError('יותר מדי ניסיונות. נסה שוב מאוחר יותר.');
      } else if (code === 'auth/missing-email' || code === 'auth/invalid-recipient-email') {
        setError('כתובת אימייל לא תקינה.');
      } else if (code === 'auth/network-request-failed') {
        setError('שגיאת רשת. בדוק חיבור לאינטרנט ונסה שוב.');
      } else {
        // Fallback: show raw message for debugging, but also handle enumeration
        console.error('sendPasswordResetEmail failed:', err);
        setError(err?.message || 'שגיאה בשליחת אימייל. נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authOverlay) return;
    const prev = document.title;
    document.title = 'מתחבר... | Boeing727';
    return () => { document.title = prev; };
  }, [authOverlay]);

  return (
    <div className="min-h-screen h-full bg-slate-950 flex flex-col relative overflow-hidden">
      {/* FLL field backdrop: faint game mat + grid + FIRST color glows (same DNA as chat) */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <img
          src="/bioglow-table.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.14]"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/85 to-slate-950" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[380px] bg-yellow-400/[0.08] rounded-full blur-3xl" />
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
        className="flex-1 flex items-center justify-center p-4"
      >
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(250,204,21,0.06)] rounded-3xl w-full max-w-md relative overflow-hidden">
          <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-l from-transparent via-yellow-400/80 to-transparent" />
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-40 bg-yellow-400/[0.08] rounded-full blur-3xl pointer-events-none" aria-hidden />

          <button
            onClick={() => navigate('/')}
            className="absolute top-4 right-4 text-slate-300 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/10 border border-white/10 transition-all text-xs font-bold cursor-pointer flex items-center gap-1 z-10"
          >
            <ArrowRight className="w-3 h-3" />
            <span>חזרה</span>
          </button>

          <div className="p-6 md:p-8 pt-14">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute -inset-3 bg-yellow-400/20 blur-2xl rounded-full pointer-events-none" aria-hidden />
              <div className="relative w-16 h-16 bg-white rounded-full flex items-center justify-center ring-2 ring-yellow-400/70 shadow-[0_0_36px_rgba(250,204,21,0.35)] overflow-hidden">
                {showReset ? <KeyRound className="w-7 h-7 text-slate-900" /> : <img src="/logoref.png" alt="שופט וירטואלי" className="w-11 h-11 object-contain" />}
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
                          setShowReset(false);
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
                        <label className="block text-xs font-bold text-slate-400 mb-1.5 text-right">אימייל</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_0_4px_rgba(250,204,21,0.12)] focus:bg-slate-800 transition-all"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium leading-relaxed text-right"
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
                            setShowReset(false);
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
                  <h1 className="text-2xl font-black text-white text-center mb-1">
                    {isSignUp ? 'יצירת חשבון' : 'התחברות'}
                  </h1>
                  <p className="text-slate-400 text-sm text-center mb-4">
                    {isSignUp
                      ? 'צור חשבון כדי להשתמש בשופט הווירטואלי'
                      : 'התחבר עם אימייל וסיסמה'}
                  </p>
                  <div className="flex items-center gap-2 mb-6" aria-hidden>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent to-yellow-400/30" />
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/60" />
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent to-yellow-400/30" />
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
                          <label className="block text-xs font-bold text-slate-400 mb-1.5 text-right">שם מלא</label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="השם שלך"
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl px-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_0_4px_rgba(250,204,21,0.12)] focus:bg-slate-800 transition-all text-right"
                            dir="auto"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1.5 text-right">אימייל</label>
                        <div className="relative group">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-yellow-400 transition-colors" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_0_4px_rgba(250,204,21,0.12)] focus:bg-slate-800 transition-all"
                            dir="ltr"
                          />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1.5 text-right">סיסמה</label>
                        <div className="relative group">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-yellow-400 transition-colors" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="********"
                            required
                            minLength={6}
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 focus:shadow-[0_0_0_4px_rgba(250,204,21,0.12)] focus:bg-slate-800 transition-all"
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
                        className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium leading-relaxed text-right"
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
                            setShowReset(true);
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
                        setIsSignUp(!isSignUp);
                        setError(null);
                      }}
                      className="text-yellow-400 hover:text-yellow-300 text-sm font-bold cursor-pointer transition-colors"
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

      {/* Auth Overlay - verifying + success */}
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
                  className="absolute inset-3 rounded-full border border-yellow-400/20"
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
                    <p className="text-yellow-400 font-black text-xl">ברוך הבא{welcomeName ? `, ${welcomeName}` : ''}!</p>
                    <p className="text-slate-400 text-sm font-bold mt-1.5">נכנסים לשופט הווירטואלי...</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boeing 727 credit */}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 pointer-events-none" aria-hidden>
        <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-4 w-auto object-contain opacity-70" />
        <span className="text-[11px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727</span>
      </div>

    </div>
  );
}
