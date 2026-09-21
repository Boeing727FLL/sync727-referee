/** firebase/auth.ts — the Auth singleton and Google provider. */
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { app } from './app';

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// No Drive scopes: the app only needs the basic Google profile (name, email,
// picture), which Firebase Auth already provides. Requesting Drive access
// would hand every XSS or token leak full Drive power for zero benefit.
googleProvider.setCustomParameters({
  prompt: 'consent'
});
