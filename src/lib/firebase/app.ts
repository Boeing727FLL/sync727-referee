/**
 * firebase/app.ts — the one initialized Firebase app + App Check.
 *
 * Services are split per module (auth / firestore / rtdb) so a route pays
 * only for the SDK it actually uses. Never re-initialize anywhere else.
 */
import { initializeApp } from "firebase/app";
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
