/**
 * firebase.ts — one initialized Firebase app shared by the whole codebase.
 *
 * SERVICES: Auth (email/password + Google), Firestore (users, rulebooks,
 * corrections, key pool — offline-persistent), Realtime Database (all
 * analytics/presence/flags), Storage, Messaging (initialized only where
 * supported). App Check (reCAPTCHA Enterprise) attests web clients.
 */
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyAShqcVG0F-Vjkg8uVK9QYRjgLGyUAI_PI",
  authDomain: "sync-727-referee.firebaseapp.com",
  databaseURL: "https://sync-727-referee-default-rtdb.firebaseio.com",
  projectId: "sync-727-referee",
  storageBucket: "sync-727-referee.firebasestorage.app",
  messagingSenderId: "804828140815",
  appId: "1:804828140815:web:9a617392dea1e037649a7a"
};

export const app = initializeApp(firebaseConfig);

// App Check with reCAPTCHA Enterprise — prevents stolen keys from being used off-site.
// Site key: 6LcEk6ctAAAAAGS3vCurKE6m51gjwgF57dAOuZk1 (fllref.abrdns.com, fllref.netlify.app)
if (typeof window !== 'undefined') {
  try {
    // Enable debug token on localhost so you can register it in Console → App Check → Manage debug tokens
    // @ts-ignore
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider('6LcEk6ctAAAAAGS3vCurKE6m51gjwgF57dAOuZk1'),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('App Check init failed:', e);
  }
}

// --- Service singletons (import these, never re-initialize) ---
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});
export const rtdb = getDatabase(app);
export const storage = getStorage(app);

export let messaging: any = null;
isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  }
}).catch(console.warn);

export const googleProvider = new GoogleAuthProvider();

// No Drive scopes: the app only needs the basic Google profile (name, email,
// picture), which Firebase Auth already provides. Requesting Drive access
// would hand every XSS or token leak full Drive power for zero benefit.
googleProvider.setCustomParameters({
  prompt: 'consent'
});
