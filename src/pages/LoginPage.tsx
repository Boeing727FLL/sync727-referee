import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, type MotionValue } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, Gavel, ArrowRight, KeyRound, CheckCircle2 } from 'lucide-react';

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
  const pendingAuthRef = useRef<{ email: string; password: string; isSignUp: boolean; name: string } | null>(null);

  const doAuth = async (emailVal: string, passwordVal: string, isSignUpMode: boolean, nameVal: string) => {
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

      setShowFaceId(false);
      setLoading(false);
      setShowSuccess(true);

      setTimeout(() => setIsConverging(true), 4500);
      setTimeout(() => setIsFadingOut(true), 5000);
      setTimeout(() => navigate('/?enter=chat'), 5500);
    } catch (err: any) {
      setLoading(false);
      setShowFaceId(false);
      setFaceIdDone(false);
      const code = err.code;
      if (code === 'auth/email-already-in-use') {
        setError('כבר קיים חשבון עם האימייל הזה. נסה להתחבר.');
      } else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        setError('אימייל או סיסמה שגויים.');
      } else if (code === 'auth/wrong-password') {
        setError('סיסמה שגויה.');
      } else if (code === 'auth/weak-password') {
        setError('הסיסמה חלשה מדי. נדרשים לפחות 6 תווים.');
      } else if (code === 'auth/invalid-email') {
        setError('כתובת אימייל לא תקינה.');
      } else if (code === 'auth/too-many-requests') {
        setError('יותר מדי ניסיונות. נסה שוב מאוחר יותר.');
      } else {
        setError(err.message);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    pendingAuthRef.current = { email, password, isSignUp, name };
    setShowFaceId(true);
    setFaceIdDone(false);
  };

  const handleFaceIdComplete = async () => {
    setFaceIdDone(true);
    await new Promise(r => setTimeout(r, 400));
    const pending = pendingAuthRef.current;
    if (!pending) return;
    setLoading(true);
    await doAuth(pending.email, pending.password, pending.isSignUp, pending.name);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, resetEmail, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
      setResetSent(true);
    } catch (err: any) {
      const code = err.code;
      if (code === 'auth/user-not-found') {
        setError('לא נמצא חשבון עם האימייל הזה.');
      } else if (code === 'auth/invalid-email') {
        setError('כתובת אימייל לא תקינה.');
      } else if (code === 'auth/too-many-requests') {
        setError('יותר מדי ניסיונות. נסה שוב מאוחר יותר.');
      } else {
        setError(err.message);
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
    if (faceIdDone) {
      handleFaceIdComplete();
    }
  }, [faceIdDone]);

  useEffect(() => {
    const controls = animate(orbitProgress, 360, { duration: 8, repeat: Infinity, ease: 'linear' });
    return controls.stop;
  }, [orbitProgress]);

  useEffect(() => {
    if (!showFaceId) return;
    setFaceIdDone(false);
    const timer = setTimeout(() => setFaceIdDone(true), 2500);
    return () => clearTimeout(timer);
  }, [showFaceId]);

  return (
    <div className="min-h-screen h-full bg-[#f5fbf7] bg-[radial-gradient(#bedec6_1.5px,transparent_1.5px)] bg-[size:32px_32px] flex flex-col relative overflow-hidden">

      {/* Card - fades out when success animation starts */}
      <motion.div
        animate={{
          opacity: showSuccess ? 0 : 1,
          scale: showSuccess ? 0.95 : 1,
        }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 flex items-center justify-center p-4"
      >
        <div className="bg-slate-900 border border-slate-800 shadow-2xl rounded-3xl w-full max-w-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-yellow-400 to-emerald-500" />

          <button
            onClick={() => navigate('/')}
            className="absolute top-4 right-4 text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors text-xs font-bold cursor-pointer flex items-center gap-1 z-10"
          >
            <ArrowRight className="w-3 h-3" />
            <span>חזרה</span>
          </button>

          <div className="p-6 md:p-8 pt-14">
            <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner border border-slate-700">
              {showReset ? <KeyRound className="w-7 h-7 text-white" /> : <Gavel className="w-7 h-7 text-white" />}
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
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 transition-all"
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
                  <p className="text-slate-400 text-sm text-center mb-6">
                    {isSignUp
                      ? 'צור חשבון כדי להשתמש בשופט הווירטואלי'
                      : 'התחבר עם אימייל וסיסמה'}
                  </p>

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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 transition-all text-right"
                            dir="auto"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5 text-right">אימייל</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          required
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 transition-all"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5 text-right">סיסמה</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="********"
                          required
                          minLength={6}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/50 transition-all"
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

                    {!isSignUp && (
                      <div className="text-left">
                        <button
                          type="button"
                          onClick={() => {
                            setShowReset(true);
                            setError(null);
                          }}
                          className="text-yellow-400/70 hover:text-yellow-400 text-xs font-bold cursor-pointer transition-colors"
                        >
                          שכחתי סיסמה
                        </button>
                      </div>
                    )}

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
                        <span>{isSignUp ? 'צור חשבון' : 'היכנס'}</span>
                      )}
                    </button>
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
              {/* Center Gavel */}
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
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.3)] relative">
                  <Gavel className="w-12 h-12 text-slate-900" />
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
            onClick={() => { if (!faceIdDone) { setShowFaceId(false); } }}
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
                {!faceIdDone && (
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
                  {faceIdDone && (
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
              </div>

              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-white font-bold text-sm"
              >
                {faceIdDone ? 'האימות הושלם' : 'מזהה אותך...'}
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
