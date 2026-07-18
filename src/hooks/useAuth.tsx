import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  GoogleAuthProvider,
  User as FirebaseUser,
  signInAnonymously,
  updateProfile,
  setPersistence,
  inMemoryPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { auth, googleProvider, messaging } from '../lib/firebase';
import { getToken } from 'firebase/messaging';

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
  isTeamVerified: boolean;
  rememberedUser: { name: string; role: 'member' | 'parent' | 'mentor' } | null;
  loginWithPasscode: (code: string, name: string, role?: 'member' | 'parent' | 'mentor') => Promise<{ success: boolean; error?: string }>;
  connectDrive: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearRememberedUser: () => Promise<void>;
  changeUserPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateProfilePicture: (url: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { isTodayAMeetingDay, getTodayDateStr } from '../lib/meetingScheduler';

// Default whitelist if none exists in DB (Fail-safe only for admin)
const DEFAULT_WHITELISTS = {
  mentor: ['boeing727.il@gmail.com', 'טאק 1', 'טאק 2', 'יובל'],
  member: ['הילה', 'יובל', 'נטע', 'עילאי', 'עמית', 'רועי'],
  parent: ['יובל'],
  admins: ['boeing727.il@gmail.com', 'יובל']
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTeamVerified, setIsTeamVerified] = useState(false); // Do not persist across reloads
  const [rememberedUser, setRememberedUser] = useState<{ name: string; role: 'member' | 'parent' | 'mentor' } | null>(null);
  const [whitelists, setWhitelists] = useState<any>(DEFAULT_WHITELISTS);
  const navigate = useNavigate();

  useEffect(() => {
    // 0. Load remembered user from localStorage (so we remember name/role even if logged out)
    let savedInfo = null;
    try {
      savedInfo = localStorage.getItem('saved_user_info');
    } catch (e) {
      console.warn("localStorage is not accessible", e);
    }
    if (savedInfo) {
      try {
        setRememberedUser(JSON.parse(savedInfo));
      } catch (e) {
        console.error("Failed to parse saved user info", e);
      }
    }

    // Set persistence to SESSION (clears when tab is closed or refreshed)
    setPersistence(auth, inMemoryPersistence).catch((e) => console.warn("Persistence warning:", e));

    // 1. Listen for Auth State
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser);
      
      if (!currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn("Auto-anonymous login failed (non-critical):", e);
        }
      }
      
      // Note: We intentionally DO NOT auto-login the user here even if currentUser exists.
      // This forces the user to enter their passcode again on refresh.
      
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // 2. Listen for Whitelist Updates
  useEffect(() => {
    const unsubscribeWhitelists = onSnapshot(doc(db, 'app_config', 'whitelists'), (docSnap) => {
      if (docSnap.exists()) {
        setWhitelists(docSnap.data());
      } else {
        // Initialize if not exists
        setDoc(doc(db, 'app_config', 'whitelists'), DEFAULT_WHITELISTS);
        setWhitelists(DEFAULT_WHITELISTS);
      }
    }, (error) => {
      console.error("Whitelist snapshot error:", error);
    });

    return () => unsubscribeWhitelists();
  }, []);

  // 3. Listen for App Background/Foreground to lock session
  useEffect(() => {
    let backgroundTime: number | null = null;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        backgroundTime = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (backgroundTime && isTeamVerified) {
          const timeInBackground = Date.now() - backgroundTime;
          // If in background for more than 10 seconds (e.g., screen turned off), lock it
          // This allows quick app switches (like file pickers) without logging out
          // Apply this lock ONLY on mobile devices (native or mobile browser)
          const isMobile = /Mobi|Android/i.test(navigator.userAgent);
          if (timeInBackground > 10000 && isMobile) {
            setUser(null);
            setIsTeamVerified(false);
            navigate('/');
          }
        }
        backgroundTime = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTeamVerified, navigate]);

  const runDailyMeetingPushReminder = async () => {
    try {
      // 1. Get today's date in Jerusalem timezone (YYYY-MM-DD)
      const options = { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
      const todayStr = new Intl.DateTimeFormat('fr-CA', options).format(new Date()); // YYYY-MM-DD

      // 2. Check if the hour in Jerusalem is >= 13 (1:00 PM)
      const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false });
      const currentHour = parseInt(timeFormatter.format(new Date()));
      if (currentHour < 13) {
        console.log('Daily push reminder check: Too early (hour is ' + currentHour + ', required >= 13)');
        return; 
      }

      // 3. Check if we already sent the push today to avoid double triggers
      const lockDocRef = doc(db, 'scheduled_pushes', todayStr);
      const lockDocSnap = await getDoc(lockDocRef);
      if (lockDocSnap.exists() && lockDocSnap.data()?.sent === true) {
        console.log('Daily push reminder check: Already sent today (' + todayStr + ')');
        return; 
      }

      // 4. Fetch the global settings to inspect the schedule
      const settingsRef = doc(db, 'global_settings', 'main');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        console.log('Daily push reminder check: Global settings main doc does not exist');
        return;
      }
      
      const settings = settingsSnap.data();
      const schedule = settings.meeting_schedule;
      if (!schedule) {
        console.log('Daily push reminder check: meeting_schedule not configured in settings');
        return;
      }

      // 5. Determine if today is a meeting day and NOT cancelled using our unified schedule helper
      const isMeetingToday = isTodayAMeetingDay(schedule);
      const specialEvent = schedule.specialEvents?.find((e: any) => e.date === todayStr);
      const meetingDescription = specialEvent?.type !== 'cancelled' ? specialEvent?.description || '' : '';

      if (!isMeetingToday) {
        console.log('Daily push reminder check: Today (' + todayStr + ') is not an active meeting day (cancelled or normally off)');
        return; 
      }

      // 6. Set the lock document first to prevent concurrent device race triggers
      await setDoc(lockDocRef, {
        sent: true,
        sentAt: Date.now(),
        triggeredBy: user?.uid || 'anonymous'
      });

      console.log('Daily push trigger activating for date: ' + todayStr);

      // 7. Retrieve all subscriptions
      const subsRef = collection(db, 'push_subscriptions');
      const subsSnap = await getDocs(subsRef);
      
      const subscriptions: any[] = [];
      const tokens: string[] = [];

      subsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.subscription) {
          subscriptions.push(data.subscription);
        }
        if (data.fcmToken) {
          tokens.push(data.fcmToken);
        }
      });

      if (subscriptions.length === 0 && tokens.length === 0) {
        console.log('Daily push: No subscriptions or FCM tokens found to notify.');
        return;
      }

      // 8. Call our existing Express API proxy to handle the payload sending
      const payload = {
        title: "תזכורת נוכחות 🕒",
        body: "שלום לחברי הצוות! היום יש מפגש קבוצתי" + (meetingDescription ? ` (${meetingDescription})` : '') + ". אנא כנסו עכשיו לעדכן את הנוכחות שלכם!",
        url: "/?tab=attendance",
        sound: 'https://orangefreesounds.com/wp-content/uploads/2014/10/Boeing-747-attendant-chime.mp3'
      };

      console.log('Sending push to ' + subscriptions.length + ' web subs and ' + tokens.length + ' FCM tokens...');
      const response = await fetch('/api/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscriptions,
          tokens,
          payload
        })
      });

      const resData = await response.json();
      console.log('Daily meeting push reminder completed! Server response:', resData);

    } catch (err) {
      console.error('Error in runDailyMeetingPushReminder:', err);
    }
  };

  // Run the daily reminder check when logged in, and trigger a periodic check every 5 minutes
  useEffect(() => {
    if (!isTeamVerified || !user) return;

    // Run immediately on page transition/login
    runDailyMeetingPushReminder();

    // Check periodically
    const intervalId = setInterval(() => {
      runDailyMeetingPushReminder();
    }, 5 * 60 * 1000); 

    return () => clearInterval(intervalId);
  }, [isTeamVerified, user?.uid]);

  const loginWithPasscode = async (code: string, name: string, role: 'member' | 'parent' | 'mentor' = 'member') => {
    const cleanName = name.trim();
    if (!cleanName) {
      return { success: false, error: 'נא להזין שם' };
    }

    const normalizeName = (s: any) => String(s || '')
      .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    const normCleanName = normalizeName(name);

    // 1. Helper function for list matching
    const checkList = (list: any[]) => {
      if (!list || !Array.isArray(list)) return false;
      return list.some((n: any) => {
        // Handle case where admin accidentally pasted comma separated list
        const subNames = String(n || '').split(',').map(s => normalizeName(s));
        return subNames.includes(normCleanName);
      });
    };

    // 2. Check User in Firestore
    try {
      // Use cleanName (original casing) for deterministicId to maintain backward compatibility
      const deterministicId = `${role}_${cleanName.replace(/\s+/g, '_')}`;
      const userDocRef = doc(db, 'users', deterministicId);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        // User exists, validate password
        const userData = userDocSnap.data();
        if (userData.password !== code) {
          return { success: false, error: 'סיסמה שגויה' };
        }
      } else {
        // User does not exist, check whitelist!
        const isWhitelisted = checkList(whitelists[role]) ||
                              checkList(DEFAULT_WHITELISTS[role]) ||
                              checkList(whitelists.admins) ||
                              checkList(DEFAULT_WHITELISTS.admins);
        
        if (!isWhitelisted) {
           return { success: false, error: `השם "${cleanName}" אינו מורשה לכניסת ${role === 'member' ? 'תלמידים' : role === 'parent' ? 'הורים' : 'מנטורים'}` };
        }

        // Whitelisted! Create new user with this password
        await setDoc(userDocRef, {
          name: cleanName,
          role: role,
          password: code,
          createdAt: new Date().toISOString()
        });
      }

      // Login Success
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn("Anonymous login failed, proceeding with app-level auth only:", e);
        }
      }

      // Check Admin Status
      const isAdmin = checkList(whitelists.admins) || checkList(DEFAULT_WHITELISTS.admins);

      const userData: User = {
        uid: deterministicId,
        name: cleanName,
        picture: userDocSnap.exists() && userDocSnap.data().picture ? userDocSnap.data().picture : `https://api.dicebear.com/7.x/initials/svg?seed=${deterministicId}`,
        email: role === 'mentor' ? 'mentor@sync727.com' : 'team@sync727.com',
        role: role,
        isAdmin: isAdmin
      };
      
      setUser(userData);
      setIsTeamVerified(true);

      if (auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, { displayName: `${role}::${cleanName}` });
        } catch (e) {
          console.warn("Update profile failed:", e);
        }
      }
      setRememberedUser({ name: cleanName, role });
      localStorage.setItem('saved_user_info', JSON.stringify({ name: cleanName, role }));
      
      if (role === 'parent') {
        navigate('/parents');
      } else if (role === 'mentor') {
        navigate('/mentors');
      } else {
        navigate('/dashboard');
      }
      
      // Attempt to subscribe to push notifications
      setTimeout(() => {
        subscribeToPushNotifications(deterministicId, role);
      }, 2000);

      // Listen for messages from Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'PLAY_SOUND') {
            const audio = new Audio(event.data.sound || 'https://orangefreesounds.com/wp-content/uploads/2014/10/Boeing-747-attendant-chime.mp3');
            audio.play().catch(e => console.error("Foreground sound playback failed:", e));
          }
        });
      }

      return { success: true };

    } catch (error: any) {
      console.error("Login error:", error);
      return { success: false, error: 'שגיאת התחברות: ' + error.message };
    }
  };

  const changeUserPassword = async (newPassword: string) => {
    if (!user || !user.uid) return { success: false, error: 'User not logged in' };
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        password: newPassword
      });
      return { success: true };
    } catch (error: any) {
      console.error("Change password error:", error);
      return { success: false, error: error.message };
    }
  };

  const updateProfilePicture = async (url: string) => {
    if (!user || !user.uid) return { success: false, error: 'User not logged in' };
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        picture: url
      });
      setUser({ ...user, picture: url });
      return { success: true };
    } catch (error: any) {
      console.error("Update profile picture error:", error);
      return { success: false, error: error.message };
    }
  };

  const connectDrive = async () => {
    try {
      console.log("Starting connectDrive...");
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Popup closed. User:", result.user.email);
      
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      console.log("Token acquired:", !!token);

      if (token) {
        console.log("Sending token to server...");
        localStorage.setItem('google_access_token', token);
        
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, user: {
            name: result.user.displayName,
            picture: result.user.photoURL,
            email: result.user.email
          }}),
        });
        
        if (!res.ok) {
          const errText = await res.text();
          console.error("Server rejected session:", errText);
          return { success: false, error: "Server session error: " + res.status };
        }
        
        console.log("Server session established.");
        
        const isMentor = result.user.email === 'boeing727.il@gmail.com';
        const updatedUser: User = {
          ...(user || {}),
          uid: result.user.uid,
          name: result.user.displayName || user?.name || 'boeing727',
          picture: result.user.photoURL || user?.picture || '',
          email: result.user.email || user?.email || '',
          role: isMentor ? 'mentor' : (user?.role || 'member'),
          isAdmin: user?.isAdmin
        };
        
        setUser(updatedUser);
        
        // Attempt to subscribe to push notifications
        setTimeout(() => {
          subscribeToPushNotifications(updatedUser.uid, updatedUser.role || 'member');
        }, 2000);

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

  const logout = async () => {
    try {
      // Always sign out of Firebase to clear session
      await signOut(auth);
    } catch (e) {
      console.warn("Firebase signOut failed:", e);
    }
    
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn("API logout call failed:", e);
    }

    try {
      setUser(null);
      setIsTeamVerified(false);
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('team_user');
      localStorage.removeItem('saved_user_info');
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

  const clearRememberedUser = async () => {
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: "" });
    }
    setRememberedUser(null);
  };

  const subscribeToPushNotifications = async (userId: string, role: string) => {
    try {
      if (!('serviceWorker' in navigator)) {
        console.log('Service workers are not supported by the browser.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Push notification permission denied.');
        return;
      }

      // 1. Traditional Web Push (VAPID)
      let webPushSubscription = null;
      let registration: ServiceWorkerRegistration | null = null;
      try {
        const swUrl = '/push-sw.js';
        await navigator.serviceWorker.register(swUrl);
        registration = await navigator.serviceWorker.ready;
        
        const vapidPublicKey = "BMPQLMhgXBit7rGAaP-tsf18u9ROlevl6Cmz5Efew7FDbe5ajwX9l88Rxsp8fGJW4i5TLPQNCP3rLclktzx6CPU";
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        webPushSubscription = await registration.pushManager.getSubscription();
        if (webPushSubscription) {
          await webPushSubscription.unsubscribe().catch(() => {});
        }
        
        webPushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      } catch (swErr) {
        console.error('Traditional Web Push subscription failed:', swErr);
      }

      // 2. Firebase Cloud Messaging (FCM)
      let fcmToken = null;
      try {
        if (messaging && registration) {
          fcmToken = await getToken(messaging, {
            vapidKey: "BMPQLMhgXBit7rGAaP-tsf18u9ROlevl6Cmz5Efew7FDbe5ajwX9l88Rxsp8fGJW4i5TLPQNCP3rLclktzx6CPU",
            serviceWorkerRegistration: registration
          });
          console.log('FCM Token acquired:', fcmToken);
        }
      } catch (fcmErr) {
        console.warn('FCM subscription failed (this is expected on non-PWA iOS):', fcmErr);
      }

      // 3. Save both to Firestore
      await setDoc(doc(db, 'push_subscriptions', userId), {
        userId,
        userName: userId.split('_').slice(1).join(' '),
        role,
        subscription: webPushSubscription ? JSON.parse(JSON.stringify(webPushSubscription)) : null,
        fcmToken: fcmToken,
        updatedAt: Date.now()
      });
      
      console.log('Push notification registration successful for:', userId);
    } catch (error) {
      console.error('Error in push notification check:', error);
    }
  };

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  return (
    <AuthContext.Provider value={{ user, loading, isTeamVerified, rememberedUser, loginWithPasscode, connectDrive, logout, clearRememberedUser, changeUserPassword, updateProfilePicture }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
