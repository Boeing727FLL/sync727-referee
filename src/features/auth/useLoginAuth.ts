/**
 * useLoginAuth — the login page's brain, shared by the /login route and the
 * landing page's inline login stage: one view machine (signin | signup |
 * reset), the Firebase auth calls, the post-login overlay choreography, and
 * the maintenance gate. Owns no markup; callers own the look and the
 * navigation target via onSuccess.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import { auth } from '../../lib/firebase/auth';
import { subscribeMaintenanceGate } from '../../lib/refereeFlags';
import { isCurrentUserOwner, isOwnerEmail } from '../../lib/owner';
import { initialLoginView, isResetView, isSignUpView, type LoginView } from './loginFlow';

/** Staged timings of the post-login departure (tuned as one choreography). */
const VERIFY_DELAY_MS = 650;
const SUCCESS_HOLD_MS = 1050;
const NAVIGATE_AFTER_LEAVE_MS = 520;
/** Inline handoff (landing page): a short beat to read the button state,
 *  then the gate opens and the cut begins from the stable, unmoved logo.
 *  No gather/morph between the form and the animation. */
const INLINE_VERIFY_DELAY_MS = 250;
const INLINE_SUCCESS_HOLD_MS = 150;

/** Firebase Auth error code -> Hebrew message (single source of truth). */
const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'כבר קיים חשבון עם האימייל הזה. נסה להתחבר.',
  'auth/user-not-found': 'אימייל או סיסמה שגויים.',
  'auth/invalid-credential': 'אימייל או סיסמה שגויים.',
  'auth/wrong-password': 'סיסמה שגויה.',
  'auth/weak-password': 'הסיסמה חלשה מדי. נדרשים לפחות 6 תווים.',
  'auth/invalid-email': 'כתובת אימייל לא תקינה.',
  'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
  'auth/missing-email': 'כתובת אימייל לא תקינה.',
  'auth/invalid-recipient-email': 'כתובת אימייל לא תקינה.',
  'auth/network-request-failed': 'שגיאת רשת. בדוק חיבור לאינטרנט ונסה שוב.',
};

/** Look up the Hebrew message, falling back to the raw Firebase text. */
function authErrorMessage(code: string | undefined, fallback: string): string {
  if (code && FIREBASE_AUTH_MESSAGES[code]) return FIREBASE_AUTH_MESSAGES[code];
  return fallback;
}

/** Credentials captured at submit time (the overlay flow is async). */
type PendingAuth = {
  email: string;
  password: string;
  isSignUp: boolean;
  name: string;
};

export function useLoginAuth({ onSuccess, handoff = 'overlay' }: { onSuccess: () => void; handoff?: 'overlay' | 'inline' }) {
  // -- form state ------------------------------------------------------------
  // One view machine instead of the old isSignUp/showReset boolean pair
  // (which allowed the illegal sign-up+reset combination).
  const [view, setView] = useState<LoginView>(initialLoginView);
  const isSignUp = isSignUpView(view);
  const showReset = isResetView(view);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // -- post-login overlay state (verifying -> success -> golden exit) --------
  const [authOverlay, setAuthOverlay] = useState<null | 'verifying' | 'success'>(null);
  const [authLeaving, setAuthLeaving] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const pendingAuthRef = useRef<PendingAuth | null>(null);
  const authTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // -- maintenance gate (non-owners see the work screen instead) -------------
  const [maintenance, setMaintenance] = useState(false);
  const [formUnlocked, setFormUnlocked] = useState(false);
  const logoTapTimesRef = useRef<number[]>([]);
  const ownerHere = isCurrentUserOwner();
  useEffect(() => {
    return subscribeMaintenanceGate(setMaintenance);
  }, []);

  // Hidden owner bypass: 5 rapid taps on the maintenance logo reveal the form.
  const handleSecretTap = () => {
    const now = Date.now();
    logoTapTimesRef.current = logoTapTimesRef.current.filter(t => now - t < 2000);
    logoTapTimesRef.current.push(now);
    if (logoTapTimesRef.current.length >= 5) {
      logoTapTimesRef.current = [];
      setFormUnlocked(true);
    }
  };
  const gated = maintenance && !ownerHere && !formUnlocked;

  // Deferred timers (departure choreography) are tracked for unmount cleanup.
  useEffect(() => {
    const timers = authTimersRef.current;
    return () => { timers.forEach(clearTimeout); };
  }, []);

  const later = (fn: () => void, ms: number) => {
    authTimersRef.current.push(setTimeout(fn, ms));
  };

  /**
   * Run Firebase signup/signin, persist the user doc on first signup, and
   * cache a light session for the chat page. Returns true on success and
   * shows a Hebrew error otherwise.
   */
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

        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('../../lib/firebase/firestore');
        await setDoc(doc(db, 'users', uid), {
          email: userEmail,
          name: displayName,
          createdAt: serverTimestamp(),
          role: 'member',
          uid,
        });

        // Registered users = users who actually signed up (lazy: keeps
        // RTDB+Firestore analytics off the login form's first paint).
        const { trackRefereeUser } = await import('../../lib/analytics');
        trackRefereeUser(uid);

        await result.user.reload();
      } else {
        const result = await signInWithEmailAndPassword(auth, emailVal, passwordVal);
        uid = result.user.uid;
        userEmail = result.user.email || emailVal;
        try {
          // Fail-open: auth already succeeded — a Firestore denial here
          // (outage, App Check) must not masquerade as a login failure.
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../../lib/firebase/firestore');
          displayName = (await getDoc(doc(db, 'users', uid))).data()?.name || emailVal.split('@')[0];
        } catch {
          displayName = emailVal.split('@')[0];
        }
      }

      // Owner gate: the owner account must verify its email. An unverified
      // owner login is blocked with a verify prompt (the Firebase
      // verification email is re-sent), and the session is signed out so
      // no partial login persists. Regular accounts are unaffected.
      if (isOwnerEmail(userEmail) && auth.currentUser) {
        try { await auth.currentUser.reload(); } catch {}
        if (!auth.currentUser.emailVerified) {
          try { await sendEmailVerification(auth.currentUser); } catch {}
          try { await auth.signOut(); } catch {}
          try { localStorage.removeItem('auth_user'); } catch {}
          setLoading(false);
          setError('חשבון הבעלים חייב אימות אימייל. נשלח אליך מייל אימות — אמת את האימייל ואז התחבר שוב.');
          return false;
        }
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
      setError(authErrorMessage(err?.code, 'שגיאת התחברות. בדוק את הפרטים ונסה שוב.'));
      return false;
    }
  };

  /**
   * Submit handler: freeze credentials, show the verifying overlay, then run
   * auth after a beat so the animation reads. On success the content plays a
   * dark dissolve and navigation happens while the stage is still opaque
   * (invisible swap); the disclaimer springs in as the next beat.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    pendingAuthRef.current = { email, password, isSignUp, name };
    if (handoff === 'inline') {
      // No intermediate screen and no morph: the button shows progress
      // inline, then the gate opens directly and the stable logo is cut.
      setLoading(true);
      later(async () => {
        const pending = pendingAuthRef.current;
        if (!pending) return;
        const authOk = await doAuth(pending.email, pending.password, pending.isSignUp, pending.name);
        if (authOk) {
          const fbUid = auth.currentUser?.uid || 'anon';
          const { trackRefereeUser } = await import('../../lib/analytics');
          trackRefereeUser(fbUid);
          setLoading(false);
          later(() => onSuccess(), INLINE_SUCCESS_HOLD_MS);
        }
      }, INLINE_VERIFY_DELAY_MS);
      return;
    }
    setAuthOverlay('verifying');
    setAuthLeaving(false);
    later(async () => {
      const pending = pendingAuthRef.current;
      if (!pending) return;
      setLoading(true);
      const authOk = await doAuth(pending.email, pending.password, pending.isSignUp, pending.name);
      if (authOk) {
        const fbUid = auth.currentUser?.uid || 'anon';
        const { trackRefereeUser } = await import('../../lib/analytics');
        trackRefereeUser(fbUid);
        setWelcomeName(pending.name || pending.email.split('@')[0]);
        setAuthOverlay('success');
        later(() => {
          setAuthLeaving(true);
          later(() => onSuccess(), NAVIGATE_AFTER_LEAVE_MS);
        }, SUCCESS_HOLD_MS);
      } else {
        setAuthOverlay(null);
      }
    }, VERIFY_DELAY_MS);
  };

  /**
   * Password reset with Hebrew email. Tries the app continue-URL first and
   * falls back to the plain Firebase handler when the domain is not
   * whitelisted yet. A "user not found" still shows success on purpose, so
   * the form never leaks which emails exist.
   */
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
      } else {
        console.error('sendPasswordResetEmail failed:', err);
        setError(authErrorMessage(code, err?.message || 'שגיאה בשליחת אימייל. נסה שוב.'));
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

  return {
    view, setView, isSignUp, showReset,
    email, setEmail, password, setPassword, name, setName,
    resetEmail, setResetEmail, showPassword, setShowPassword,
    loading, error, setError, resetSent, setResetSent,
    authOverlay, authLeaving, welcomeName,
    gated, handleSecretTap,
    handleSubmit, handleResetPassword,
  };
}
