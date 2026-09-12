/**
 * useAuth — the referee app's Firebase session context.
 *
 * WHAT: a thin wrapper around Firebase Auth exposing exactly three things
 * the app uses: the signed-in `user`, Google Drive `connectDrive`, and
 * `logout`. Login/logout screens talk to Firebase directly; this context
 * only keeps the session alive, synced, and reachable.
 *
 * HISTORY NOTE: this file once hosted the main team app's passcode login,
 * whitelist gates, and push-notification stack (~400 lines). None of it is
 * used by the referee app — the only consumer reads
 * { connectDrive, user, logout } — so it was deleted outright. The legacy
 * team system is gone; what remains is the complete live surface.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { isOwnerEmail } from '../lib/owner';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface User {
  uid: string;
  name: string;
  picture: string;
  email: string;
  role?: 'mentor' | 'member' | 'parent' | 'admin';
  birthDate?: string;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  connectDrive: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider: session bootstrap, Drive connect, logout
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Session bootstrap, once per mount: browser-persistent login (so auth
  // survives close/reopen instead of wiping like in-memory persistence
  // did), then mirror the Firebase user into `loading` only. The app
  // resolves its own display user from context/localStorage elsewhere.
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    const unsubscribeAuth = onAuthStateChanged(auth, async () => {
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  /**
   * Google sign-in popup that also yields a Drive access token. User state
   * is set immediately from the Google profile; the backend session call
   * that follows is best-effort and never blocks the login.
   */
  const connectDrive = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (token) {
        // Login state lives in Firebase Auth itself, tokens are never
        // stored in localStorage anymore.

        // Store user picture/name in localStorage IMMEDIATELY (before server session)
        if (result.user.photoURL) {
          localStorage.setItem('user_picture', result.user.photoURL);
        }
        if (result.user.displayName) {
          localStorage.setItem('user_name', result.user.displayName);
        }

        // Set user state immediately so components can access it
        const updatedUser: User = {
          ...(user || {}),
          uid: result.user.uid,
          name: result.user.displayName || user?.name || 'boeing727',
          picture: result.user.photoURL || user?.picture || '',
          email: result.user.email || user?.email || '',
          role: isOwnerEmail(result.user.email) ? 'mentor' : (user?.role || 'member'),
          isAdmin: user?.isAdmin
        };
        setUser(updatedUser);

        // We do not save team_user to localStorage so it resets on refresh
        return { success: true };
      } else {
        console.error("No access token received from Google");
        return { success: false, error: "No access token received from Google" };
      }
    } catch (error: any) {
      console.error("Drive connection error:", error);
      let errorMessage = error.message;
      if (error?.code === 'auth/unauthorized-domain') {
        errorMessage = "שגיאה: הדומיין של Netlify לא מורשה ב-Firebase. יש להיכנס למסוף Firebase -> Authentication -> Settings -> Authorized domains ולהוסיף את הדומיין של האתר.";
      } else if (error?.code === 'auth/popup-closed-by-user' || error?.code?.includes('cross-origin')) {
        errorMessage = "שגיאת דפדפן: לא ניתן לפתוח חלון התחברות בתוך חלונית מקדימה. אנא פתח את האפליקציה בחלון/טאב חדש או אפשר חלונות קופצים (Popups) כדי להתחבר.";
      }
      return { success: false, error: errorMessage };
    }
  };

  /**
   * Full logout: Firebase sign-out, local traces wiped, back home.
   * (The referee page removes its own `auth_user` entry on top of this.)
   */
  const logout = async () => {
    try {
      // Always sign out of Firebase to clear session
      await signOut(auth);
    } catch (e) {
      console.warn("Firebase signOut failed:", e);
    }

    try {
      setUser(null);
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('team_user');
      localStorage.removeItem('saved_user_info');
      localStorage.removeItem('user_picture');
      localStorage.removeItem('user_name');
    } catch (e) {
      console.error("Local storage cleanup failed:", e);
    }

    try {
      navigate('/');
    } catch (e) {
      console.error("Navigation to '/' failed, redirecting manually:", e);
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, connectDrive, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook (must render inside <AuthProvider>)
// ---------------------------------------------------------------------------

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
