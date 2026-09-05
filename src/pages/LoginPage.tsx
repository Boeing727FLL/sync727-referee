import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { trackRefereeUser } from '../lib/analytics';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, type MotionValue } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, KeyRound, CheckCircle2 } from 'lucide-react';

function OrbitItem({ progress, angle, children }: { progress: MotionValue<number>; angle: number; children: React.ReactNode }) {
  const x = useTransform(() => Math.cos((angle + progress.get()) * Math.PI / 180) * 170);
  const y = useTransform(() => Math.sin((angle + progress.get()) * Math.PI / 180) * 170);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 15 }}
      style={{ position: 'absolute', left: '50%', top: '50%', x, y }}
    >
      <div style={{ transform: 'translate(-50%, -50%)' }}>
        {children}
      </div>
    </motion.div>
  );
}

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
  const [showSuccess, setShowSuccess] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isConverging, setIsConverging] = useState(false);
  const [showFaceId, setShowFaceId] = useState(false);
  const [faceIdDone, setFaceIdDone] = useState(false);
  const [faceIdError, setFaceIdError] = useState<string | null>(null);
  const pendingAuthRef = useRef<{ email: string; password: string; isSignUp: boolean; name: string } | null>(null);

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
      setFaceIdDone(false);
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
      setFaceIdError(msg);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    pendingAuthRef.current = { email, password, isSignUp, name };
    setShowFaceId(true);
    setFaceIdDone(false);
    setFaceIdError(null);
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

  const userData = (() => {
    try { return JSON.parse(localStorage.getItem('auth_user') || '{}'); } catch { return {}; }
  })();

  const orbitProgress = useMotionValue(0);

  useEffect(() => {
    const controls = animate(orbitProgress, 360, { duration: 8, repeat: Infinity, ease: 'linear' });
    return controls.stop;
  }, [orbitProgress]);

  useEffect(() => {
    if (!showFaceId) return;
    setFaceIdDone(false);
    setFaceIdError(null);
    const timer = setTimeout(async () => {
      const pending = pendingAuthRef.current;
      if (!pending) return;
      setLoading(true);
      const authOk = await doAuth(pending.email, pending.password, pending.isSignUp, pending.name);
      if (authOk) {
        const fbUid = auth.currentUser?.uid || 'anon';
        trackRefereeUser(fbUid);
        setFaceIdDone(true);
        await new Promise(r => setTimeout(r, 400));
        setShowFaceId(false);
        setShowSuccess(true);
        setTimeout(() => setIsConverging(true), 4500);
        setTimeout(() => setIsFadingOut(true), 5000);
        setTimeout(() => navigate('/?enter=chat'), 5500);
      } else {
        setFaceIdDone(false);
        await new Promise(r => setTimeout(r, 2500));
        setShowFaceId(false);
        setFaceIdError(null);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [showFaceId]);

  return (
    <div className="min-h-screen h-full bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Ambient glows to match the chat theme */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[380px] bg-yellow-400/[0.07] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[420px] h-[280px] bg-blue-600/[0.08] rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-0 w-[300px] h-[300px] bg-red-600/[0.05] rounded-full blur-3xl" />
      </div>

      {/* Card - fades out when success animation starts */}
      <motion.div
        animate={{
          opacity: showSuccess ? 0 : 1,
          scale: showSuccess ? 0.95 : 1,
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

      {/* Login Success Animation Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            key="success-overlay"
            initial={{ opacity: 0 }}
            animate={{
              opacity: isFadingOut ? 0 : 1,
              scale: isConverging ? 0.92 : 1,
              filter: isConverging ? 'blur(12px)' : 'blur(0px)',
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900"
          >
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Center Logo */}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 180, damping: 12, mass: 1.2, delay: 0.15 }}
                className="z-20 flex flex-col items-center gap-4"
              >
                <motion.div
                  animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0.6, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -inset-4 rounded-full bg-yellow-400/15 blur-2xl"
                />
                <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.3)] relative border-2 border-slate-950">
                  <img src="/logoref.png" alt="שופט וירטואלי" className="w-16 h-16 object-contain" />
                </div>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="text-yellow-400 font-black text-base"
                >
                  השופט הווירטואלי
                </motion.p>
              </motion.div>

              {/* Orbit ring */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="absolute w-[340px] h-[340px] rounded-full border border-yellow-400/10"
              />

              {/* Rotating orbit items */}
              {[
                { label: userData.name || 'משתמש', emoji: '👤', angle: -90, isPicture: false },
                { label: null, angle: 30, isPicture: true },
                { label: userData.email || '', emoji: '✉️', angle: 150, isPicture: false },
              ].map((item) => (
                <OrbitItem key={item.angle} progress={orbitProgress} angle={item.angle}>
                  <motion.div
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    {item.isPicture ? (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-400/20 border-2 border-yellow-300/50">
                        <span className="text-xl font-black text-slate-900">
                          {(userData.name || 'U')[0]}
                        </span>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-800/90 border border-yellow-400/30 flex items-center justify-center">
                        <span className="text-lg">{item.emoji}</span>
                      </div>
                    )}
                    {item.label && (
                      <span className="text-xs font-bold text-yellow-400/90 whitespace-nowrap">
                        {item.label}
                      </span>
                    )}
                  </motion.div>
                </OrbitItem>
              ))}

              {/* Bottom text */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
                className="absolute bottom-[12%] text-yellow-400/70 font-black text-base z-10 tracking-tight"
              >
                מזהה אותך...
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boeing 727 credit */}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 pointer-events-none" aria-hidden>
        <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-4 w-auto object-contain opacity-70" />
        <span className="text-[11px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727</span>
      </div>

      {/* Face ID Animation Overlay */}
      <AnimatePresence>
        {showFaceId && (
          <motion.div
            key="faceid-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm"
            onClick={() => { if (!faceIdDone && !faceIdError) { setShowFaceId(false); } else if (faceIdError) { setShowFaceId(false); setFaceIdError(null); } }}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="flex flex-col items-center gap-6"
            >
              {/* Face ID Icon Container */}
              <div className="relative w-28 h-28">
                {/* Face ID outline */}
                <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="2.5">
                  {/* Corner brackets */}
                  <path d="M25 5 H15 Q5 5 5 15 V25" className="text-white" strokeLinecap="round" />
                  <path d="M75 5 H85 Q95 5 95 15 V25" className="text-white" strokeLinecap="round" />
                  <path d="M25 95 H15 Q5 95 5 85 V75" className="text-white" strokeLinecap="round" />
                  <path d="M75 95 H85 Q95 95 95 85 V75" className="text-white" strokeLinecap="round" />
                  {/* Face features */}
                  <circle cx="38" cy="38" r="3" fill="currentColor" className="text-white" />
                  <circle cx="62" cy="38" r="3" fill="currentColor" className="text-white" />
                  <path d="M38 58 Q50 68 62 58" strokeLinecap="round" className="text-white" />
                  <path d="M50 42 V52" strokeLinecap="round" className="text-white" />
                </svg>

                {/* Scanning line */}
                {!faceIdDone && !faceIdError && (
                  <motion.div
                    initial={{ top: '10%' }}
                    animate={{ top: ['10%', '85%', '10%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-transparent via-yellow-400 to-transparent"
                    style={{ boxShadow: '0 0 12px rgba(250,204,21,0.6)' }}
                  />
                )}

                {/* Checkmark on done */}
                <AnimatePresence>
                  {faceIdDone && !faceIdError && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <motion.path
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* X on failure */}
                <AnimatePresence>
                  {faceIdError && !faceIdDone && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)]">
                        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <motion.path
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.25 }}
                            d="M6 6l12 12"
                          />
                          <motion.path
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.25, delay: 0.2 }}
                            d="M18 6L6 18"
                          />
                        </svg>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white font-bold text-sm text-center px-6"
              >
                {faceIdError && !faceIdDone ? faceIdError : faceIdDone ? 'האימות הושלם' : 'מזהה אותך...'}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
