import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, FileText, Scale, Upload as UploadIcon, LogOut, Trash2, Shield, ChevronDown } from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GeminiService } from '../services/geminiService';
import { s3Client, R2_BUCKET_NAME, getPublicUrl } from '../lib/r2';
import { Upload } from '@aws-sdk/lib-storage';
import { ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { convertPdfToImages } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ConfirmationModal from '../components/ConfirmationModal';
import AdminAnalyticsModal from '../components/AdminAnalyticsModal';
import RefereeLogsModal from '../components/RefereeLogsModal';
import JudgeCorrectionsModal from '../components/JudgeCorrectionsModal';
import FeedbackModal from '../components/FeedbackModal';
import IntroScreen from '../components/IntroScreen';
import MandatoryDisclaimerModal from '../components/MandatoryDisclaimerModal';
import { isCurrentUserOwner } from '../lib/owner';
import { trackQuestion, startPresence, trackRefereeUser, getDeviceId, registerSession, watchSession, logRefereeQA, removeRefereeUser } from '../lib/analytics';
import { signOut, deleteUser, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../lib/firebase';

const stripThinkBlocks = (text: string): string =>
  (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();

export default function PublicRulebookAI() {
  const navigate = useNavigate();
  const { connectDrive, user, logout } = useAuth();
  const { t, language, isRTL } = useLanguage();
  
  // Login state comes only from Firebase Auth (user) or the saved auth_user.
  // URL bypass params were removed for security, everyone must log in.
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(false);
  const [showMigrationBanner, setShowMigrationBanner] = useState<boolean>(false);
  // Keep hasGoogleToken in sync with Firebase Auth so the
  // browserLocalPersistence session survives close/reopen the next day.
  // If a stale localStorage entry exists from the old inMemory days
  // (hasLocal true but no Firebase user), clear it and ask for one-time re-login.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setHasGoogleToken(true);
      } else {
        const hasLocal = !!localStorage.getItem('google_access_token') ||
          !!localStorage.getItem('auth_user');
        if (hasLocal) {
          localStorage.removeItem('google_access_token');
          localStorage.removeItem('auth_user');
          localStorage.removeItem('user_picture');
          localStorage.removeItem('user_name');
          setHasGoogleToken(false);
          setShowMigrationBanner(true);
          setTimeout(() => setShowMigrationBanner(false), 6000);
        } else {
          setHasGoogleToken(false);
        }
      }
    });
    return () => unsub();
  }, []);

  const displayUser = useMemo(() => {
    if (user) return user;
    try {
      const fb = auth.currentUser as any;
      if (fb?.email || fb?.displayName) {
        return {
          name: fb.displayName || fb.email?.split('@')[0] || 'משתמש',
          picture: fb.photoURL || '',
          email: fb.email || '',
        } as any;
      }
      const raw = localStorage.getItem('auth_user');
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.email || p?.name) {
          return {
            name: p.name || p.email?.split('@')[0] || 'משתמש',
            picture: p.picture || '',
            email: p.email || '',
          } as any;
        }
      }
      const pic = localStorage.getItem('user_picture');
      const nm = localStorage.getItem('user_name');
      if (pic || nm) {
        return { name: nm || 'משתמש', picture: pic || '', email: '' } as any;
      }
    } catch {}
    return null;
  }, [user, hasGoogleToken]);
  // Force reload when a new version is deployed so cached outdated clients get App Check
  useEffect(() => {
    // @ts-ignore
    const localVer = typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : '';
    if (!localVer) return;
    const checkVersion = async () => {
      try {
        const r = await fetch('/version.json?cb=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const serverVer = String(j.version || '');
        if (serverVer && localVer && serverVer !== localVer) {
          window.location.reload();
        }
      } catch {}
    };
    const t1 = setTimeout(checkVersion, 5000);
    const iv = setInterval(checkVersion, 60000);
    const onVis = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t1);
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const [loginError, setLoginError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState<boolean>(true);
  const [chatStarted, setChatStarted] = useState<boolean>(false);
  const [showEnterAnimation, setShowEnterAnimation] = useState<boolean>(false);
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(false);
  const [pendingEnterChat, setPendingEnterChat] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [showAdminAnalytics, setShowAdminAnalytics] = useState<boolean>(false);
  const [showRefereeLogs, setShowRefereeLogs] = useState<boolean>(false);
  const [showJudgeCorrections, setShowJudgeCorrections] = useState<boolean>(false);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoTapTimesRef = useRef<number[]>([]);
  const developByTapTimesRef = useRef<number[]>([]);
  const boeingTapTimesRef = useRef<number[]>([]);
  const [deviceType, setDeviceType] = useState<'mobile' | 'desktop' | 'tablet'>(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
        if (/iPad|tablet/i.test(ua)) {
          return 'tablet';
        }
        return 'mobile';
      }
    }
    return 'desktop';
  });

  useEffect(() => {
    const checkDevice = () => {
      const ua = navigator.userAgent;
      if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
        if (/iPad|tablet/i.test(ua)) {
          setDeviceType('tablet');
        } else {
          setDeviceType('mobile');
        }
      } else {
        setDeviceType('desktop');
      }
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);
  
  useEffect(() => {
    const token = localStorage.getItem('google_access_token');
    if (!token) return;
    // Already have picture stored
    if (localStorage.getItem('user_picture')) return;
    // Fetch from Google
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.picture) localStorage.setItem('user_picture', data.picture);
        if (data.name) localStorage.setItem('user_name', data.name);
      })
      .catch(() => {});
  }, []);

  // Auto-enter chat after login — always show mandatory disclaimer before entering
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('enter') && params.get('enter') === 'chat' && (hasGoogleToken || user)) {
      setPendingEnterChat(true);
      setShowDisclaimer(true);
    }
  }, [user, hasGoogleToken]);

  const [typewriterReady, setTypewriterReady] = useState<boolean>(false);

  const handleDisclaimerConfirm = () => {
    // Everything in a single tick: modal and intro fade out together while
    // the chat fades in and the typewriter starts at once. No staged timers,
    // so nothing ever sits stuck or flashes before animating.
    if (pendingEnterChat) {
      window.history.replaceState({}, '', '/');
      setPendingEnterChat(false);
    }
    setShowEnterAnimation(true);
    setShowDisclaimer(false);
    setShowIntro(false);
    setChatStarted(true);
    setTypewriterReady(true);
    setTimeout(() => setShowEnterAnimation(false), 1100);
  };

  const handleIntroContinue = () => {
    if (hasGoogleToken || user) {
      setShowDisclaimer(true);
    } else {
      navigate('/login');
    }
  };

  // Resolve the real logged-in referee user uid (from auth context or the new LoginPage's localStorage)
  const resolveRefereeUid = (): string | null => {
    if (user?.uid) return user.uid;
    try {
      const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
      if (authUser?.uid) return authUser.uid;
    } catch (e) {}
    return null;
  };

  // Presence + single-session lock: mark this user as online and watch for
  // the same user logging in from another device (which kicks this one).
  useEffect(() => {
    const realUid = resolveRefereeUid();
    const presenceUid = realUid || 'anon';
    const cleanup = startPresence(presenceUid);
    if (realUid) trackRefereeUser(realUid);

    let unsubSession: (() => void) | undefined;
    let disposed = false;
    if (realUid) {
      const deviceId = getDeviceId();
      // Register first, then watch, so we don't kick ourselves on the initial snapshot.
      registerSession(realUid, deviceId).then(() => {
        if (disposed) return;
        unsubSession = watchSession(realUid, deviceId, () => {
          handleSessionKicked();
        });
      });
    }

    return () => {
      disposed = true;
      if (unsubSession) unsubSession();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Secret: 5 rapid taps on the logo opens the analytics panel
  const handleLogoTap = () => {
    const now = Date.now();
    logoTapTimesRef.current = logoTapTimesRef.current.filter(t => now - t < 2000);
    logoTapTimesRef.current.push(now);
    if (logoTapTimesRef.current.length >= 5) {
      logoTapTimesRef.current = [];
      setShowAdminAnalytics(true);
    }
  };

  // Secret: 5 taps on the "Developed By" caption opens the head-referee logs screen
  const handleDevelopByTap = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    developByTapTimesRef.current.push(Date.now());
    if (developByTapTimesRef.current.length >= 5) {
      developByTapTimesRef.current = [];
      setShowRefereeLogs(true);
    }
  };

  // Secret: 5 rapid taps on the Boeing badge opens the judge corrections editor (code 6767)
  const handleBoeingTap = () => {
    const now = Date.now();
    boeingTapTimesRef.current = boeingTapTimesRef.current.filter(t => now - t < 2000);
    boeingTapTimesRef.current.push(now);
    if (boeingTapTimesRef.current.length >= 5) {
      boeingTapTimesRef.current = [];
      setShowJudgeCorrections(true);
    }
  };

  // Feedback popup frequency control - never too often:
  // at most once every 14 days per device, and no new prompt for 45 days after submitting.
  const maybePromptFeedback = () => {
    if (showFeedback) return;
    const now = Date.now();
    const lastPrompt = parseInt(localStorage.getItem('referee_feedback_last_prompt') || '0', 10);
    const submittedAt = parseInt(localStorage.getItem('referee_feedback_submitted_at') || '0', 10);
    if (submittedAt && now - submittedAt < 45 * 24 * 60 * 60 * 1000) return;
    if (lastPrompt && now - lastPrompt < 14 * 24 * 60 * 60 * 1000) return;
    localStorage.setItem('referee_feedback_last_prompt', String(now));
    feedbackTimeoutRef.current = setTimeout(() => {
      setShowFeedback(true);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {}
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('auth_user');
    setHasGoogleToken(false);
    setShowLogoutConfirm(false);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    const current = auth.currentUser;
    if (!current || !current.email) {
      setDeleteError('אין משתמש מחובר. התחברו ונסו שוב.');
      return;
    }
    if (!deletePassword) {
      setDeleteError('יש להזין סיסמה כדי לאשר מחיקה.');
      return;
    }
    setDeletingAccount(true);
    try {
      const cred = EmailAuthProvider.credential(current.email, deletePassword);
      await reauthenticateWithCredential(current, cred);
    } catch {
      setDeletingAccount(false);
      setDeleteError('סיסמה שגויה. המחיקה לא בוצעה.');
      return;
    }
    const uid = current.uid;
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (e) {
      setDeletingAccount(false);
      setDeleteError('מחיקת מסמך המשתמש נכשלה. נסו שוב.');
      return;
    }
    try {
      await deleteUser(current);
    } catch {
      setDeletingAccount(false);
      setDeleteError('מחיקת החשבון נכשלה. התחברו מחדש ונסו שוב.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'sessions', uid));
    } catch { /* session doc may not exist */ }
    await removeRefereeUser(uid);
    try { await logout(); } catch { /* ignore */ }
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('user_picture');
    localStorage.removeItem('user_name');
    setHasGoogleToken(false);
    setShowDeleteConfirm(false);
    setDeletingAccount(false);
    setDeletePassword('');
    setDeleteError(null);
    setShowIntro(true);
    setChatStarted(false);
  };

  const [sessionKicked, setSessionKicked] = useState(false);

  const handleSessionKicked = async () => {
    // Another device logged in with the same user - force disconnect this one.
    try {
      await signOut(auth);
    } catch (e) {}
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('auth_user');
    setHasGoogleToken(false);
    setSessionKicked(true);
  };
  const [seasonName, setSeasonName] = useState<string>('UNKNOWN');
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string, files?: { url: string, key: string, name?: string, base64?: string }[] }[]>([
    { role: 'model', text: t('chat.greeting').replace('{season}', seasonName) }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeRulebookFiles, setActiveRulebookFiles] = useState<{ name: string, url: string }[]>([]);

  const [tripleJudgeMode] = useState<boolean>(true);
  const [thinkingConfigLevel] = useState<'HIGH' | 'OFF' | 'LOW'>('HIGH');
  const [isLearning, setIsLearning] = useState(true);
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const originalTitle = document.title;
    let originalFavicon = '';
    const faviconElement = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    
    if (faviconElement) {
      originalFavicon = faviconElement.href;
      // Change to the Virtual Referee logo
      faviconElement.href = "/favicon-192.png?v=3";
    }
    
    document.title = 'שופט וירטואלי | Boeing727';

    return () => {
      document.title = originalTitle;
      if (faviconElement && originalFavicon) {
        faviconElement.href = originalFavicon;
      }
    };
  }, []);

  useEffect(() => {
    if (adminClickCount >= 10) {
      setShowAdmin(true);
      setAdminClickCount(0); // Reset after unlocking
    }
  }, [adminClickCount]);

  const handleTitleClick = () => {
    if (!showAdmin) {
      setAdminClickCount(prev => prev + 1);
    }
  };

  // Upload modal is for rulebook files only. Judge corrections live in
  // the dedicated JudgeCorrectionsModal (Boeing badge), not here.
  const openUploadModal = () => {
    setShowUploadModal(true);
  };

  useEffect(() => {
    if (activeRulebookFiles.length > 0) {
      setIsLearning(true);
      // Removed local/proxy indexing - using official Gemini with direct context
      setTimeout(() => setIsLearning(false), 1500);
    }
  }, [activeRulebookFiles]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const typewriterTargetRef = useRef(0);
  const [typewriterCount, setTypewriterCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!typewriterReady) return;
      setTypewriterCount(prev => {
        if (prev >= typewriterTargetRef.current) return prev;
        return prev + 1;
      });
    }, 35);
    return () => clearInterval(interval);
  }, [typewriterReady]);

  useEffect(() => {
    if (loading) {
      setTypewriterCount(0);
      typewriterTargetRef.current = 0;
    }
  }, [loading]);

  useEffect(() => {
    if (chatStarted && typewriterReady) {
      setTypewriterCount(0);
      typewriterTargetRef.current = 0;
    }
  }, [chatStarted, typewriterReady]);

  useEffect(() => {
    if (typewriterReady && chatStarted) {
      setTypewriterCount(0);
      typewriterTargetRef.current = 0;
    }
  }, [typewriterReady]);

  useEffect(() => {
    if (!chatStarted) setTypewriterReady(false);
  }, [chatStarted]);

  const isTypewriterActive = typewriterCount < typewriterTargetRef.current;

  useEffect(() => {
    setMessages(prev => {
      const newMessages = [...prev];
      if (newMessages.length > 0 && newMessages[0].role === 'model') {
        newMessages[0] = { ...newMessages[0], text: t('chat.greeting').replace('{season}', seasonName) };
      }
      return newMessages;
    });
  }, [language]);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'app_config', 'rulebook'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.current_season && data.current_season !== seasonName) {
          setSeasonName(data.current_season);
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages.length > 0 && newMessages[0].role === 'model') {
              newMessages[0].text = t('chat.greeting').replace('{season}', data.current_season);
            }
            return newMessages;
          });
        }
        fetchLatestRulebook();
      } else {
        fetchLatestRulebook();
      }
    });

    return () => unsubSettings();
  }, [seasonName]);

const fetchLatestRulebook = async () => {
    try {
      let files = [];
      try {
        const command = new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: 'fll-rules/',
        });
        const response = await s3Client.send(command);
        files = response.Contents || [];
      } catch (apiErr) {
        console.error("Direct R2 client list failed:", apiErr);
      }

      if (files.length > 0) {
        const relevantFiles = files.filter((f: any) => 
          f.Key && f.Key !== 'fll-rules/'
        ).sort((a: any, b: any) => (new Date(b.LastModified).getTime() || 0) - (new Date(a.LastModified).getTime() || 0));
        
        const filesToLoad = relevantFiles.slice(0, 5);
        
        const loadedFiles: { name: string, url: string }[] = [];

        for (const file of filesToLoad) {
           if (!file.Key) continue;
           const fileName = file.Key.replace('fll-rules/', '');
           const fileUrl = getPublicUrl(file.Key);
           
           loadedFiles.push({
             name: fileName,
             url: fileUrl
           });
        }
        
        setActiveRulebookFiles(loadedFiles);

        const detectedSeason = loadedFiles.reduce((season, f) => {
          const extracted = extractSeasonFromFilename(f.name);
          return extracted !== 'UNKNOWN' ? extracted : season;
        }, 'UNKNOWN');

        if (detectedSeason !== 'UNKNOWN') {
          if (detectedSeason !== seasonName) {
            setSeasonName(detectedSeason);
            try {
              await updateDoc(doc(db, 'app_config', 'rulebook'), {
                current_season: detectedSeason,
                last_updated: Date.now()
              });
            } catch (e) {}
            setMessages(prev => {
              const newMessages = [...prev];
              if (newMessages.length > 0 && newMessages[0].role === 'model') {
                newMessages[0] = { ...newMessages[0], text: t('chat.greeting').replace('{season}', detectedSeason) };
              }
              return newMessages;
            });
          }
        } else if (seasonName !== 'UNKNOWN') {
          setSeasonName('UNKNOWN');
          try {
            await updateDoc(doc(db, 'app_config', 'rulebook'), {
              current_season: 'UNKNOWN',
              last_updated: Date.now()
            });
          } catch (e) {}
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages.length > 0 && newMessages[0].role === 'model') {
              newMessages[0] = { ...newMessages[0], text: t('chat.greeting').replace('{season}', 'UNKNOWN') };
            }
            return newMessages;
          });
        }
      } else {
        setIsLearning(false);
      }
    } catch (err) {
      console.error("Failed to fetch rulebook:", err);
      setIsLearning(false);
    }
  };

  const extractSeasonFromFilename = (filename: string): string => {
    const str = filename.toLowerCase();
    
    if (str.includes('submerged')) return 'SUBMERGED';
    if (str.includes('unearthed') || str.includes('unearth')) return 'UNEARTHED';
    if (str.includes('masterpiece') || str.includes('mustrpiece') || str.includes('master')) return 'MASTERPIECE';
    if (str.includes('superpowered') || str.includes('super power')) return 'SUPERPOWERED';
    if (str.includes('cargoconnect') || str.includes('cargo connect')) return 'CARGO_CONNECT';
    if (str.includes('replay') || str.includes('re-play')) return 'REPLAY';
    if (str.includes('cityshaper') || str.includes('city shaper')) return 'CITY_SHAPER';
    if (str.includes('intoorbit') || str.includes('into orbit')) return 'INTO_ORBIT';

    const match = str.match(/fll[_-]?(?:challenge[_-])?([a-z]+)[_-]/);
    if (match && match[1] && match[1] !== 'challenge' && match[1] !== 'robot') {
      return match[1].toUpperCase();
    }

    const baseName = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim();
    // Strip a trailing updates/update suffix so "Bioglow_updates.pdf" maps to the same season as "Bioglow.pdf"
    const seasonBase = baseName
      .replace(/\s*[_\-()\s]+\s*updates?\s*[)\-]*$/i, '')
      .replace(/\s+updates?\s*$/i, '')
      .trim();
    if (seasonBase && !seasonBase.toLowerCase().includes('update') && !seasonBase.toLowerCase().includes('text') && !seasonBase.toLowerCase().includes('image')) {
      return seasonBase.toUpperCase();
    }

    return 'UNKNOWN';
  };

  const [wipePending, setWipePending] = useState<{ file: File; fileName: string; season: string; oldCount: number } | null>(null);
  const [wipeTyped, setWipeTyped] = useState('');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    // New season uploads wipe all old rule files, so they need a typed
    // double confirmation BEFORE anything is uploaded or deleted.
    const detected = extractSeasonFromFilename(`fll-rules/${file.name}`);
    if (detected !== 'UNKNOWN' && detected !== seasonName) {
      let oldCount = 0;
      try {
        const resp = await s3Client.send(new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: 'fll-rules',
        }));
        oldCount = (resp.Contents || []).filter((f: any) =>
          f.Key && f.Key !== `fll-rules/${file.name}` && f.Key !== 'fll-rules/').length;
      } catch {
        oldCount = 0;
      }
      setWipePending({ file, fileName: file.name, season: detected, oldCount });
      setWipeTyped('');
      return;
    }
    await performUpload(file);
  };

  const confirmSeasonWipe = async () => {
    if (!wipePending) return;
    if (wipeTyped.trim().toUpperCase() !== wipePending.season.toUpperCase()) return;
    const file = wipePending.file;
    setWipePending(null);
    setWipeTyped('');
    await performUpload(file);
  };

  const performUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const fileName = `fll-rules/${file.name}`;
      
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          Body: file,
          ContentType: file.type || 'text/plain',
        },
      });

      upload.on("httpUploadProgress", (progress) => {
        if (progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setUploadProgress(percent);
        }
      });

      await upload.done();

      // Same-season updates file (e.g. BioGlow_updates.pdf): replace any previous version of this exact file,
      // including its generated page images and text, so only the latest upload survives.
      const prevVersionPrefixes = [
        `fll-rules-images/${file.name}/`,
        `fll-rules-text/${file.name}.txt`,
        `fll-rules/${file.name}`,
      ];
      for (const prefix of prevVersionPrefixes) {
        try {
          const listResp = await s3Client.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: prefix,
          }));
          // Never delete the file that was just uploaded in this same flow.
          // The prefix `fll-rules/<name>` also matches the new object itself,
          // and without this filter every upload ended with its own PDF deleted.
          const staleObjects = (listResp.Contents || [])
            .map((o: any) => ({ Key: o.Key }))
            .filter((o: any) => o.Key && o.Key !== fileName);
          if (staleObjects.length > 0) {
            await s3Client.send(new DeleteObjectsCommand({
              Bucket: R2_BUCKET_NAME,
              Delete: { Objects: staleObjects.slice(0, 1000) },
            }));
          }
        } catch (e) {
          console.warn(`Failed to remove previous version of ${file.name} (${prefix}):`, e);
        }
      }
      
      setShowUploadModal(false);
      setUploading(false);
      setUploadProgress(0);

      const fileUrl = getPublicUrl(fileName);

      const extractedSeason = extractSeasonFromFilename(fileName);
      const isNewSeason = extractedSeason !== "UNKNOWN" && extractedSeason !== seasonName;

      if (extractedSeason !== "UNKNOWN") {
        try {
          await updateDoc(doc(db, 'app_config', 'rulebook'), {
            current_season: extractedSeason,
            last_updated: Date.now()
          });
        } catch (e) {
          console.warn("Firestore sync update failed:", e);
        }
      }

      if (isNewSeason) {
        console.log(`New season detected: ${extractedSeason}. Clearing old rules for ${seasonName}...`);
        
        try {
          const command = new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: 'fll-rules',
          });
          const listResponse = await s3Client.send(command);
          if (listResponse.Contents && listResponse.Contents.length > 0) {
            const objectsToDelete = listResponse.Contents
              .filter((f: any) => f.Key && f.Key !== fileName && !f.Key.startsWith(`fll-rules-images/${file.name}/`) && f.Key !== `fll-rules-text/${file.name}.txt` && f.Key !== 'fll-rules/')
              .map((f: any) => ({ Key: f.Key }));
              
            if (objectsToDelete.length > 0) {
              const deleteCommand = new DeleteObjectsCommand({
                Bucket: R2_BUCKET_NAME,
                Delete: { Objects: objectsToDelete.slice(0, 1000) }
              });
              await s3Client.send(deleteCommand);
              console.log("Old rules cleared successfully.");
            }
          }
        } catch (e) {
          console.error("Failed to clear old rules:", e);
        }
      }

      const seasonLabel = extractedSeason !== "UNKNOWN" ? extractedSeason : "חדש";
      setMessages(prev => [...prev, { role: 'model', text: `קובץ חוקים חדש (${file.name}) התקבל. עונת ${seasonLabel}. מעבד תמונות...`, isProgress: true }]);

      let uploadedPageCount = -1;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const images = await convertPdfToImages(new Blob([await file.arrayBuffer()], { type: 'application/pdf' }));
          let okCount = 0;
          for (let i = 0; i < images.length; i++) {
            const imgKey = `fll-rules-images/${file.name}/page_${i + 1}.jpg`;
            try {
              await s3Client.send(new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: imgKey,
                Body: new Uint8Array(await images[i].data.arrayBuffer()),
                ContentType: 'image/jpeg',
              }));
              okCount++;
            } catch (putErr) {
              console.error(`Failed to upload page image ${imgKey}:`, putErr);
            }
            const pct = images.length > 0 ? Math.round(((i + 1) / images.length) * 100) : 100;
            setMessages(prev => {
              const newMsgs = [...prev];
              const last = newMsgs[newMsgs.length - 1];
              if (last?.role === 'model' && (last as any).isProgress) {
                newMsgs[newMsgs.length - 1] = { ...last, text: `קובץ חוקים חדש (${file.name}) התקבל. עונת ${seasonLabel}. מעבד תמונות... ${pct}% (${i + 1}/${images.length})` };
              }
              return newMsgs;
            });
          }
          uploadedPageCount = okCount;
          if (images.length === 0) {
            setMessages(prev => {
              const newMsgs = [...prev];
              const last = newMsgs[newMsgs.length - 1];
              if (last?.role === 'model' && (last as any).isProgress) {
                newMsgs[newMsgs.length - 1] = { ...last, text: `קובץ החוקים (${file.name}) הועלה, אבל המרת העמודים לתמונות נכשלה. נסו להעלות שוב.` };
              }
              return newMsgs;
            });
          } else if (okCount < images.length) {
            setMessages(prev => [...prev, { role: 'model', text: `שימו לב: הועלו ${okCount} מתוך ${images.length} עמודים. כדאי להעלות שוב כדי להשלים.` }]);
          }
        } catch (imgErr) {
          console.error("Failed to convert/upload PDF pages:", imgErr);
        }
      }

      setIsLearning(true);
      
      setTimeout(async () => {
        await fetchLatestRulebook(); 
        setIsLearning(false);
        setMessages(prev => {
          const newMsgs = [...prev];
          if (newMsgs.length > 0 && (newMsgs[newMsgs.length - 1] as any).isProgress) {
            newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: 'למדתי את העדכונים מקובץ החוקים! המידע נשמר בענן ומוכן לשימוש מכל מכשיר.' };
            delete (newMsgs[newMsgs.length - 1] as any).isProgress;
          } else {
            newMsgs.push({ role: 'model', text: 'למדתי את העדכונים מקובץ החוקים! המידע נשמר בענן ומוכן לשימוש מכל מכשיר.' });
          }
          return newMsgs;
        });
      }, 2000);

    } catch (error: any) {
      console.error('Upload error:', error);
      alert('שגיאה בהעלאת הקובץ: ' + error.message);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;

    if (!textToSend.trim() || loading) return;

    // Never answer blind: with no rulebook files loaded at all, the model
    // would fabricate. Tell the user instead of guessing.
    if (activeRulebookFiles.length === 0 && !isLearning) {
      setInput('');
      setMessages(prev => [
        ...prev,
        { role: 'user', text: textToSend.trim() },
        { role: 'model', text: 'אין חוברת חוקים טעונה כרגע, ולכן אני לא עונה כדי לא להמציא. העלו קובץ חוקים דרך מסך ההעלאה ונסו שוב.' },
      ]);
      return;
    }

    // Client-side rate limit: at most one question every 4 seconds
    // and 120 questions per hour per device.
    try {
      const now = Date.now();
      const lastSend = Number(localStorage.getItem('referee_last_send') || 0);
      if (now - lastSend < 4000) {
        setMessages(prev => [...prev, { role: 'model', text: 'חכו כמה שניות בין שאלה לשאלה.' }]);
        return;
      }
      const hour = new Date().toISOString().slice(0, 13);
      const bucketRaw = localStorage.getItem('referee_hour_bucket');
      let count = 0;
      if (bucketRaw) {
        try {
          const bucket = JSON.parse(bucketRaw);
          if (bucket.hour === hour) count = Number(bucket.count) || 0;
        } catch { count = 0; }
      }
      if (count >= 120) {
        setMessages(prev => [...prev, { role: 'model', text: 'הגעתם למכסת השאלות לשעה הקרובה. נסו שוב מאוחר יותר.' }]);
        return;
      }
      localStorage.setItem('referee_last_send', String(now));
      localStorage.setItem('referee_hour_bucket', JSON.stringify({ hour, count: count + 1 }));
    } catch { /* storage unavailable, continue without limits */ }

    const userMessage = textToSend.trim();
    
    setInput('');
    
    setMessages(prev => [
      ...prev, 
      { 
        role: 'user', 
        text: userMessage
      }
    ]);
    
    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch(e) {}

    try {
      let relevantMessages = messages;

      let finalPrompt = userMessage + "\n\n(הנחיה לשופט: אם השאלה עוסקת במשימה חדשה או מצב חדש - התעלם מהמשימה שנדונה קודם לכן ואל תערבב בין חוקים או ניקודים של משימות שונות.)";
      
      trackQuestion(resolveRefereeUid() || 'anon');
      
      const response = await GeminiService.askRulebook(
        finalPrompt,
        relevantMessages,
        activeRulebookFiles,
        seasonName,
        [], // no files - text only
        undefined, // default model
        (chunkText) => {
          if (controller.signal.aborted) return;
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg?.role === 'model') {
              newMessages[newMessages.length - 1] = {
                ...lastMsg,
                text: lastMsg.text + chunkText
              };
            } else {
              newMessages.push({ role: 'model', text: chunkText });
            }
            return newMessages;
          });
        },
        tripleJudgeMode,
        thinkingConfigLevel,
        language,
        controller.signal
      );
      
      if (controller.signal.aborted) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'model' && lastMsg.text) return prev;
          return [...prev, { role: 'model', text: '⏹️ הפעולה הופסקה על ידי המשתמש.' }];
        });
      } else {
        logRefereeQA({
          question: userMessage,
          answer: stripThinkBlocks(response) || response || t('chat.commError'),
          season: seasonName,
          language,
          uid: resolveRefereeUid(),
          model: 'gemini-3.6-flash',
          ok: true,
        });
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'model') return prev;
          return [...prev, { role: 'model', text: response || t('chat.commError') }];
        });
        maybePromptFeedback();
      }
    } catch (error: any) {
      if (controller.signal.aborted) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'model' && lastMsg.text) return prev;
          return [...prev, { role: 'model', text: '⏹️ הפעולה הופסקה על ידי המשתמש.' }];
        });
      } else {
        const errMsg = error?.message || t('chat.connectionLost');
        logRefereeQA({
          question: userMessage,
          answer: errMsg,
          season: seasonName,
          language,
          uid: resolveRefereeUid(),
          model: 'gemini-3.6-flash',
          ok: false,
        });
        setMessages(prev => [...prev, { role: 'model', text: errMsg }]);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
    }
  };

  const quickQuestions = [
    t('chat.suggestion1'),
    t('chat.suggestion2'),
    t('chat.suggestion3'),
    t('chat.suggestion4')
  ];

  const playWhistleSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2150, audioCtx.currentTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2200, audioCtx.currentTime);
      
      const modulator = audioCtx.createOscillator();
      const modulatorGain = audioCtx.createGain();
      modulator.frequency.setValueAtTime(45, audioCtx.currentTime); // Vibrato
      modulatorGain.gain.setValueAtTime(90, audioCtx.currentTime);
      
      modulator.connect(modulatorGain);
      modulatorGain.connect(osc1.frequency);
      modulatorGain.connect(osc2.frequency);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + 0.04);
      gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime + 0.12);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      modulator.start();
      osc1.start();
      osc2.start();
      
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          modulator.stop();
          audioCtx.close();
        } catch (err) {}
      }, 450);
    } catch (e) {
      console.warn("AudioContext whistle failed:", e);
    }
  };

  const handleWhistleBlow = () => {
    playWhistleSound();
    const refereeTips = [
      "📋 **הנחיית שופט וירטואלי:** רוח ספורטיבית (Gracious Professionalism) קודמת לכל הישג! כבדו את חבריכם ואת קבוצות היריב.",
      "⏱️ **חוקי הזירה:** ברגע שהגעתם לשולחן, יש לכם בדיוק 2:30 דקות להפעיל את כל המשימות שתרגלתם. בהצלחה!",
      "⚙️ **טיפ מקצועי:** זכרו, אם הרובוט יוצא מאזור הבית או משתבש במרכז המגרש - החזרתו לבית באקט ידני תגרור סימון עונש (דיסק משימה פנוי שעובר למשבצת העונשים).",
      "📏 **חוקי המבנה:** כל הציוד שלכם (כולל רובוט, אביזרים חלופיים וחלקי חילוף) חייב להיכנס במלואו לתחום אזור הבית או אזור השיגור קודם תחילת המקצה!",
      "🎯 **שימו לב:** השופט הווירטואלי מבוסס על בינה מלאכותית ומסתמך על ספר החוקים הרשמי. במקרה של ספק, מומלץ לפנות לשופט זירה אנושי."
    ];
    const quote = refereeTips[Math.floor(Math.random() * refereeTips.length)];
    setMessages(prev => [
      ...prev,
      {
        role: 'model',
        text: `😗💨🎵 *שריקה חדה מהזירה!* \n\n${quote}`
      }
    ]);
  };


  return (
    <motion.div
      initial={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      animate={showEnterAnimation
        ? { opacity: [0, 1], scale: [0.98, 1], filter: ['blur(6px)', 'blur(0px)'] }
        : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.0, ease: 'easeOut' }}
      className="h-screen h-[100dvh] w-full flex flex-col bg-white overflow-hidden relative font-sans" dir="rtl"
    >
      <AnimatePresence>
        {showMigrationBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-amber-400 text-slate-900 text-xs font-black text-center py-2.5 px-4 z-30 shrink-0"
          >
            שדרוג אבטחה — יש להתחבר מחדש פעם אחת
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Referee Ribbon */}
      <div className="h-3.5 bg-[repeating-linear-gradient(45deg,#000000,#000000_15px,#ffffff_15px,#ffffff_30px)] border-b border-slate-950 w-full shrink-0 relative">
        <div className="absolute inset-0 bg-yellow-400/20 mix-blend-multiply pointer-events-none" />
      </div>

      {/* Header */}
      <div className="border-b-2 border-slate-950 bg-amber-50 z-10 shadow-sm shrink-0">
        {/* Row 1: Logo + Title + User */}
        <div className="px-2 py-1.5 md:px-4 md:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 md:gap-3">
            <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-md border-2 border-slate-950 overflow-hidden">
              <img src="/logoref.png" alt="שופט וירטואלי" onClick={handleLogoTap} className="w-full h-full object-contain cursor-pointer select-none" />
            </div>
            <div className="min-w-0">
                <h1 onClick={handleTitleClick} className="text-[11px] md:text-xl font-black text-slate-900 flex items-center gap-1 md:gap-2 tracking-tight cursor-default select-none leading-tight">
                  {t('app.title')} <span className="text-[7px] md:text-xs bg-slate-900 text-yellow-400 px-1.5 py-[1px] rounded-full font-extrabold uppercase border border-yellow-400">{t('app.titleEn')}</span>
                </h1>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`w-[6px] h-[6px] md:w-2.5 md:h-2.5 rounded-full shrink-0 border border-slate-950 ${isLearning ? 'bg-yellow-400 animate-bounce' : 'bg-emerald-500'}`} />
                <span className="text-[7px] md:text-[10px] font-black text-slate-950 uppercase tracking-wide bg-yellow-400 px-1 md:px-1.5 py-[1px] md:py-0.5 rounded border-2 border-slate-950 shadow-[1px_1px_0px_#000]">
                  {isLearning ? t('chat.updating') : seasonName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-3">
            {hasGoogleToken && displayUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="flex items-center gap-2 md:gap-3 p-1 md:p-1.5 rounded-xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:bg-white/80 hover:border-white/60 hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all cursor-pointer"
                >
                  <div className="hidden sm:flex flex-col items-end text-right">
                    <span className="text-xs font-black text-slate-900 max-w-[120px] truncate leading-none">{displayUser.name}</span>
                    <span className="text-[10px] text-slate-600 font-medium truncate max-w-[120px]" dir="ltr">
                      {displayUser.email}
                    </span>
                  </div>
                  {displayUser.picture ? (
                    <img
                      src={displayUser.picture}
                      alt=""
                      className="w-8 h-8 md:w-9 md:h-9 rounded-full border-2 border-slate-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-full border-2 border-slate-950 bg-yellow-400 flex items-center justify-center shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                      <span className="text-xs md:text-sm font-black text-slate-950">
                        {(displayUser.name || 'U').trim().charAt(0)}
                      </span>
                    </div>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute top-full mt-2 left-0 sm:right-0 sm:left-auto w-64 bg-white/70 backdrop-blur-2xl rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] border border-white/60 overflow-hidden z-50"
                    >
                      <div className="p-3 bg-white/40 backdrop-blur-xl border-b border-white/50 flex items-center gap-3">
                        {displayUser.picture ? (
                          <img src={displayUser.picture} alt="" className="w-10 h-10 rounded-full border-2 border-slate-950 object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full border-2 border-slate-950 bg-yellow-400 flex items-center justify-center">
                            <span className="text-sm font-black text-slate-950">{(displayUser.name || 'U').trim().charAt(0)}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm font-black text-slate-900 truncate">{displayUser.name}</p>
                          <p className="text-xs text-slate-500 truncate" dir="ltr">
                            {displayUser.email}
                          </p>
                        </div>
                      </div>
                      <div className="p-2 space-y-1">
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowLogoutConfirm(true);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/70 text-slate-700 hover:text-slate-900 font-bold text-sm transition-colors text-right cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 text-slate-500" />
                          התנתק
                        </button>
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowDeleteConfirm(true);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-slate-700 hover:text-red-600 font-bold text-sm transition-colors text-right cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                          מחיקת חשבון
                        </button>
                        <div className="h-px bg-white/60 my-1" />
                        <a
                          href="/privacy"
                          onClick={() => setShowUserMenu(false)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/70 text-slate-700 hover:text-slate-900 font-bold text-sm transition-colors text-right cursor-pointer"
                        >
                          <Shield className="w-4 h-4 text-slate-500" />
                          פרטיות
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={hasGoogleToken ? () => setShowLogoutConfirm(true) : () => navigate('/login')}
                className="text-[10px] md:text-xs bg-yellow-400 hover:bg-yellow-300 text-slate-950 border-2 border-slate-950 font-black px-2 py-1 md:px-2.5 md:py-1.5 rounded-lg transition-all shadow-[1px_1px_0px_rgba(0,0,0,1)] active:scale-95 cursor-pointer flex items-center gap-1"
              >
                <span>{hasGoogleToken ? t('auth.logout') : t('auth.login')}</span>
              </button>
            )}
            <div onClick={handleBoeingTap} className="inline-flex items-center gap-1.5 md:gap-3 px-1.5 py-0.5 md:px-3 md:py-1.5 bg-white/80 rounded-lg border-2 border-slate-950 group hover:bg-white hover:border-red-600 transition-all duration-300 shadow-[2px_2px_0px_#000] whitespace-nowrap shrink-0 cursor-pointer select-none">
              <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3 md:h-8 w-auto object-contain group-hover:scale-110 transition-transform" />
              <div className="h-3 md:h-6 w-px bg-slate-300" />
              <div className="flex flex-col leading-tight">
                <span onClick={handleDevelopByTap} className="text-[5px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] cursor-pointer select-none">Developed By</span>
                <span className="text-[7px] md:text-sm font-black text-slate-950 italic leading-tight">Boeing <span className="text-red-600">727</span><span className="text-red-400 font-bold text-[6px] md:text-xs mx-px">&</span><span className="text-slate-600 font-bold not-italic text-[6px] md:text-xs">Yuval Margalit</span></span>
              </div>
            </div>
            {showAdmin && isCurrentUserOwner() && (
              <button
                onClick={openUploadModal}
                className="p-1.5 md:p-2 bg-white text-slate-900 border-2 border-slate-950 hover:bg-yellow-400 rounded-lg transition-all shadow-[1px_1px_0px_rgba(0,0,0,1)]"
                title={t('admin.upload')}
              >
                <UploadIcon className="w-3.5 h-3.5 md:w-5 md:h-5" />
              </button>
            )}
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      {/* Chat Area - Green field canvas background */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-8 space-y-4 md:space-y-8 bg-[#f5fbf7] bg-[radial-gradient(#bedec6_1.5px,transparent_1.5px)] bg-[size:32px_32px] border-b border-slate-200 scroll-smooth" ref={scrollRef}>
        
        {messages.filter((msg, idx) => !(idx === 0 && msg.role === 'model' && !chatStarted)).map((msg, idx) => {
          const isOpenThink = msg.role === 'model' && msg.text.includes('<think>') && !msg.text.includes('</think>');
          const isThinking = isOpenThink && loading && idx === messages.length - 1;
          const thinkContent = msg.text.includes('<think>') ? msg.text.split('<think>')[1]?.split('</think>')[0]?.trim() || '' : '';
          const _tOpen = '<think>';
          const _tClose = '</think>';
          const _thinkRe = new RegExp(_tOpen + '[\\s\\S]*' + _tClose, 'g');
          let finalRenderText = msg.role === 'model'
            ? msg.text.replace(_thinkRe, '').replace(/\\?rightarrow/g, '->').replace(/\\?leftarrow/g, '<-').replace(/\$/g, '').trim()
            : msg.text.replace(/\\?rightarrow/g, '->').replace(/\\?leftarrow/g, '<-').replace(/\$/g, '');
          if (!finalRenderText && msg.role === 'model') {
            if (thinkContent) {
              finalRenderText = thinkContent.replace(/\\?rightarrow/g, '->').replace(/\\?leftarrow/g, '<-').replace(/\$/g, '').trim();
            } else if (msg.text.includes('<think>')) {
              finalRenderText = msg.text.replace('<think>', '').replace(/\\?rightarrow/g, '->').replace(/\\?leftarrow/g, '<-').replace(/\$/g, '').trim();
            }
          }

          if (idx === messages.length - 1 && msg.role === 'model' && finalRenderText.length > 0 && typewriterReady) {
            typewriterTargetRef.current = finalRenderText.length;
          }
          const isTypewriting = idx === messages.length - 1 && msg.role === 'model' && typewriterReady && typewriterCount < typewriterTargetRef.current;
          if (isTypewriting) {
            finalRenderText = finalRenderText.substring(0, typewriterCount);
          }
          // Before the gate opens, hide the last model message entirely so the
          // greeting never flashes fully before typing from the start.
          if (idx === messages.length - 1 && msg.role === 'model' && !typewriterReady && chatStarted) {
            finalRenderText = '';
          }

          if (isThinking) {
            return (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                <div className="w-9 h-9 md:w-11 md:h-11 shrink-0 rounded-xl bg-white border-2 border-slate-950 shadow-[1px_1px_0px_#000] overflow-hidden flex items-center justify-center">
                  <img src="/logoref.png" alt="" className="w-7 h-7 md:w-9 md:h-9 object-contain" />
                </div>
                <div className="relative bg-white border-2 border-slate-950 p-4 rounded-2xl rounded-tl-none shadow-[3px_3px_0px_rgba(0,0,0,1)] flex flex-col gap-3 max-w-[85%] md:max-w-[75%] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-100/40 to-transparent -translate-x-full animate-shine pointer-events-none" />
                  <div className="relative flex items-center gap-3">
                    <div className="flex items-end gap-1.5 md:gap-2 h-7 md:h-8">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="relative w-2.5 md:w-3 h-full flex items-end justify-center">
                          <motion.span
                            className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full relative z-10"
                            style={{ background: 'linear-gradient(180deg, #fde047, #f59e0b)', boxShadow: '0 0 12px rgba(250,204,21,0.8)' }}
                            animate={{ y: [0, -14, 0], scale: [0.85, 1, 0.85], opacity: [0.7, 1, 0.7] }}
                            transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18, ease: [0.45, 0.05, 0.55, 0.95] }}
                          />
                          <motion.span
                            className="absolute bottom-0 w-3.5 h-1 rounded-[50%] bg-slate-950/15"
                            animate={{ scaleX: [1, 0.4, 1], opacity: [0.4, 0.1, 0.4] }}
                            transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18, ease: 'easeInOut' }}
                          />
                        </div>
                      ))}
                    </div>
                    <span className="text-xs font-black text-slate-900">{t('chat.thinking')}</span>
                  </div>
                  {thinkContent && (
                    <div className="relative text-[10px] md:text-xs font-mono text-slate-500 whitespace-pre-wrap px-1 max-h-48 overflow-y-auto">
                      {thinkContent}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={`flex gap-2.5 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Referee or User Avatar Badge */}
              <div className={`w-7 h-7 md:w-11 md:h-11 ${msg.role === 'user' ? 'rounded-full' : 'rounded-xl'} flex items-center justify-center shrink-0 border-2 border-slate-950 shadow-[1px_1px_0px_#000] relative overflow-hidden ${
                msg.role === 'user' 
                  ? 'bg-slate-100 text-slate-800' 
                  : 'bg-[repeating-linear-gradient(45deg,#000000,#000000_5px,#ffffff_5px,#ffffff_10px)]'
              }`}>
                {msg.role === 'user' ? (
                  (user?.picture || localStorage.getItem('user_picture')) ? (
                    <img src={user?.picture || localStorage.getItem('user_picture') || ''} alt="" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <User className="w-4 h-4 md:w-5 md:h-5 text-slate-850" />
                  )
                ) : (
                  <div className="absolute inset-0.5 rounded-lg overflow-hidden bg-white">
                    <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain" />
                  </div>
                )}
              </div>

              <div className={`flex flex-col gap-1.5 md:gap-2 max-w-[88%] md:max-w-[75%]`}>
                <div className={`rounded-2xl p-3 md:p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-slate-950 relative overflow-hidden ${
                  msg.role === 'user' 
                    ? 'bg-slate-900 text-white rounded-tr-none' 
                    : 'bg-white text-slate-900 rounded-tl-none before:absolute before:top-0 before:right-0 before:left-0 before:h-2 before:bg-[repeating-linear-gradient(-45deg,#000000,#000000_8px,#ffffff_8px,#ffffff_16px)] pt-6'
                }`}>
                  
                  {/* Referee Tag */}
                  {msg.role !== 'user' && (
                    <div className="flex items-center gap-1 mb-1.5 md:mb-2">
                      <span className="text-[8px] md:text-[10px] font-black tracking-tight text-slate-905 bg-yellow-400 border border-slate-950 px-1.5 md:px-2 py-[1px] md:py-0.5 rounded shadow-[1px_1px_0px_#000] flex items-center gap-1 uppercase">
                         {t('chat.refereeTag')}
                      </span>
                      {finalRenderText.includes("שריקה") && (
                        <span className="text-[8px] md:text-[10px] font-black text-white bg-red-600 border border-slate-950 px-1.5 md:px-2 py-[1px] md:py-0.5 rounded shadow-[1px_1px_0px_#000]">
                            {t('chat.foulTag')}
                        </span>
                      )}
                    </div>
                  )}

                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4 bg-black/5 p-2 rounded-2xl">
                      {msg.files.map((file, fIdx) => (
                        <div key={fIdx} className="relative w-16 h-16 md:w-32 md:h-32 group">
                      {(file.key.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.base64?.startsWith('data:image')) ? (
                         <img src={file.url} alt="Attached" className="w-full h-full object-cover rounded-xl shadow-md border-2 border-slate-950" />
                      ) : (
                          <div className="w-full h-full flex items-center justify-center bg-white rounded-xl border-2 border-slate-950 shadow-md">
                                <FileText className="w-6 h-6 md:w-8 md:h-8 text-slate-400" />
                             </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className={`text-[13px] md:text-[17px] leading-relaxed ${msg.role === 'user' ? 'font-medium' : 'font-normal'}`}>
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                    ) : (
                      <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:font-black prose-a:text-blue-600 prose-strong:text-slate-900 prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 rtl:text-right">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            em: ({children, ...props}) => {
                              const txt = typeof children === 'string' ? children : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string' ? children[0] : null;
                              if (txt === '█') return <span className="typewriter-cursor">█</span>;
                              return <em {...props}>{children}</em>;
                            }
                          }}
                        >
                          {isTypewriting ? finalRenderText + '*█*' : finalRenderText}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
                {msg.role === 'model' && idx > 0 && (
                  <div className="flex items-center gap-2 md:gap-4 px-1 md:px-2">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(finalRenderText);
                        alert(t('chat.copied'));
                      }}
                      className="text-[9px] md:text-[10px] font-black text-slate-600 hover:text-red-600 transition-colors bg-white px-1.5 md:px-2 py-0.5 rounded border border-slate-300 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
                    >
                      {t('chat.copy')}
                    </button>
                    <button className="text-[9px] md:text-[10px] font-black text-slate-600 hover:text-green-600 transition-colors bg-white px-1.5 md:px-2 py-0.5 rounded border border-slate-300 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                      👍
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5 md:gap-4">
            <div className="w-7 h-7 md:w-11 md:h-11 shrink-0 rounded-xl bg-white border-2 border-slate-950 shadow-[1px_1px_0px_#000] overflow-hidden flex items-center justify-center">
              <img src="/logoref.png" alt="" className="w-5 h-5 md:w-9 md:h-9 object-contain" />
            </div>
            <div className="relative bg-white border-2 border-slate-950 p-2.5 md:p-4 rounded-2xl rounded-tl-none shadow-[3px_3px_0px_rgba(0,0,0,1)] flex items-center gap-2 md:gap-3 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-100/40 to-transparent -translate-x-full animate-shine pointer-events-none" />
              <div className="relative flex items-center gap-2">
                <div className="flex items-end gap-1.5 h-6 md:h-8">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="relative w-2 md:w-3 h-full flex items-end justify-center">
                      <motion.span
                        className="w-2 h-2 md:w-3 md:h-3 rounded-full relative z-10"
                        style={{ background: 'linear-gradient(180deg, #fde047, #f59e0b)', boxShadow: '0 0 10px rgba(250,204,21,0.8)' }}
                        animate={{ y: [0, -12, 0], scale: [0.85, 1, 0.85], opacity: [0.7, 1, 0.7] }}
                        transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18, ease: [0.45, 0.05, 0.55, 0.95] }}
                      />
                      <motion.span
                        className="absolute bottom-0 w-3 h-1 rounded-[50%] bg-slate-950/15"
                        animate={{ scaleX: [1, 0.4, 1], opacity: [0.4, 0.1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18, ease: 'easeInOut' }}
                      />
                    </div>
                  ))}
                </div>
                <span className="relative text-[10px] md:text-xs font-black text-slate-900">{t('chat.thinking2')}</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Quick Actions - Styled as tactical yellow strategy cards */}
      <div className="px-2 md:px-4 py-1.5 md:py-3 bg-amber-50/50 border-t-2 border-slate-950 overflow-x-auto flex gap-1.5 md:gap-2 no-scrollbar shrink-0">
        {quickQuestions.map((q, i) => (
          <button
            key={i}
            onClick={() => handleSend(q)}
            disabled={loading || isLearning || isTypewriterActive}
            className="whitespace-nowrap px-3 md:px-4 py-1.5 md:py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 border-2 border-slate-950 rounded-xl text-[10px] md:text-xs font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⚠️ {q}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="px-2.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4 md:p-4 bg-white border-t-2 border-slate-950 shrink-0">
        
        <div className="flex items-center gap-2 md:gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isLearning ? t('chat.researching') : t('chat.placeholder2')}
            disabled={loading || isLearning || isTypewriterActive}
            style={{ flex: 1, minWidth: 0 }}
            className="bg-slate-50 border-2 border-slate-950 rounded-xl px-3 md:px-4 py-2 md:py-3 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-650/15 text-[13px] md:text-base text-slate-800 placeholder-slate-500 font-bold transition-all disabled:opacity-50"
          />
          
          <button
            onClick={() => handleSend()}
            disabled={loading || isLearning || isTypewriterActive || !input.trim()}
            style={{ flexShrink: 0 }}
            className="relative overflow-hidden rounded-xl transition-all flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,1)] border-2 border-slate-950 active:scale-95 active:translate-x-0.5 active:translate-y-0.5 bg-red-600 hover:bg-red-700 text-white p-2 md:p-3 disabled:opacity-50"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shine pointer-events-none" />
            <Send className="w-4 h-4 md:w-6 md:h-6" />
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UploadIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800">{t('admin.uploadTitle')}</h3>
                <p className="text-slate-500 text-sm mt-2">
                  {t('admin.uploadDesc')}
                </p>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-600/50 hover:bg-blue-600/5 transition-all group"
              >
                <FileText className="w-10 h-10 text-slate-300 group-hover:text-blue-600 transition-colors" />
                <span className="text-sm font-bold text-slate-400 group-hover:text-blue-600">{t('admin.uploadPick')}</span>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".txt,.md,.json,.docx,.pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {uploading && (
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>{t('admin.uploading')}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowUploadModal(false)}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition-colors"
              >
                {t('admin.cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {wipePending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4"
            >
              <div className="text-center">
                <div className="text-4xl mb-2">⚠️</div>
                <h3 className="text-xl font-black text-slate-800">מחיקת עונה שלמה</h3>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                  הקובץ {wipePending.fileName} מזוהה כעונה חדשה ({wipePending.season}).
                  ההעלאה תמחק {wipePending.oldCount} קבצי חוקים ישנים. כדי לאשר, הקלידו את שם העונה.
                </p>
              </div>
              <input
                type="text"
                value={wipeTyped}
                onChange={(e) => setWipeTyped(e.target.value)}
                placeholder={wipePending.season}
                className="w-full px-4 py-3 rounded-xl border-2 border-red-300 bg-red-50 text-slate-900 font-black text-center tracking-widest outline-none focus:border-red-500 transition-all"
                dir="ltr"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setWipePending(null); setWipeTyped(''); }}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={confirmSeasonWipe}
                  disabled={wipeTyped.trim().toUpperCase() !== wipePending.season.toUpperCase()}
                  className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  מחק והעלה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIntro && (
          <IntroScreen
            hasGoogleToken={hasGoogleToken}
            user={user}
            onContinue={handleIntroContinue}
            t={t}
          />
        )}
      </AnimatePresence>

      <MandatoryDisclaimerModal isOpen={showDisclaimer} onConfirm={handleDisclaimerConfirm} t={t} />

      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title={t('auth.logoutConfirmTitle')}
        message={t('auth.logoutConfirmMsg')}
        confirmText={t('auth.logoutConfirmYes')}
        cancelText={t('auth.logoutConfirmNo')}
        variant="warning"
      />

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-red-500/50 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <h3 className="text-xl font-bold text-white">מחיקת החשבון לצמיתות</h3>
                <p className="text-slate-400 text-sm">
                  החשבון ומסמך המשתמש יימחקו ולא ניתן יהיה לשחזר. לאישור, הזינו את הסיסמה.
                </p>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && !deletingAccount && handleDeleteAccount()}
                  placeholder="סיסמה"
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-all"
                />
                {deleteError && (
                  <p className="text-red-400 text-xs font-bold">{deleteError}</p>
                )}
              </div>
              <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex gap-3 justify-center">
                <button
                  onClick={() => {
                    if (deletingAccount) return;
                    setShowDeleteConfirm(false);
                    setDeletePassword('');
                    setDeleteError(null);
                  }}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white font-bold transition-colors cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || !deletePassword}
                  className="px-6 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {deletingAccount ? 'מוחק' : 'כן, מחק הכל'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AdminAnalyticsModal
        isOpen={showAdminAnalytics}
        onClose={() => setShowAdminAnalytics(false)}
      />

      <RefereeLogsModal
        isOpen={showRefereeLogs}
        onClose={() => setShowRefereeLogs(false)}
      />

      <JudgeCorrectionsModal
        isOpen={showJudgeCorrections}
        onClose={() => setShowJudgeCorrections(false)}
      />

      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        onSubmit={() => {
          localStorage.setItem('referee_feedback_submitted_at', String(Date.now()));
          setShowFeedback(false);
        }}
        season={seasonName}
        uid={resolveRefereeUid()}
      />

      <AnimatePresence>
        {sessionKicked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center"
            >
              <div className="p-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/15 flex items-center justify-center">
                  <Scale className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-lg font-black text-white mb-2">החשבון נפתח במקום אחר</h3>
                <p className="text-slate-400 text-sm mb-6">
                  המשתמש שלך נכנס ממכשיר אחר, ולכן התחברות זו נותקה כדי למנוע חוסר עקביות בנתוני האנליטיקס.
                </p>
                <button
                  onClick={() => { setSessionKicked(false); navigate('/login'); }}
                  className="w-full py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black transition-colors shadow-lg shadow-yellow-500/20"
                >
                  חזרה לכניסה
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

