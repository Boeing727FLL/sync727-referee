/**
 * PublicRulebookAI — the whole Virtual Referee experience in one screen.
 *
 * ARCHITECTURE MAP (top to bottom):
 *   1. Identity & session   — who is signed in, single-device lock, presence
 *   2. Entry flow           — intro -> mandatory disclaimer -> chat (or straight
 *                             back in via ?enter=chat after login)
 *   3. Chat engine          — messages, streaming send/stop, typewriter effect
 *   4. Rulebook management  — R2 file list, season detection, owner uploads
 *   5. Render               — backdrop, header + user menu, hero/chat, input,
 *                             and every floating layer (modals, toasts, drawers)
 *
 * STATE LIVES HERE; the lib/ services only talk to backends. Nothing in this
 * file throws to the user: failures degrade to chat notices or console warns.
 */
import React, { Suspense, useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, FileText, Scale, Upload as UploadIcon, LogOut, Trash2, Shield, ChevronDown, ChevronLeft, ListOrdered, Hand, Cog, Users, Globe, ScrollText, Wrench, Square, Check, Settings, MailCheck, Copy, Reply, X, ImagePlus } from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, rtdb } from '../lib/firebase';
import { remove as rtdbRemove, ref as rtdbRef } from 'firebase/database';
import { getPublicUrl } from '../lib/r2Config';
import ThinkIndicator from '../components/ThinkIndicator';
import { resetThinkCycle } from '../lib/thinkCycle';
import { gravatarUrlForEmail, probeImage } from '../lib/avatar';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import ConfirmationModal from '../components/ConfirmationModal';
import IntroScreen from '../components/IntroScreen';
import MandatoryDisclaimerModal from '../components/MandatoryDisclaimerModal';
import { getActiveTeamId, saveTeamQuestion } from '../services/teamWorkspaceService';
import { isCurrentUserOwner } from '../lib/owner';
import { consumeChatQuota } from '../lib/chatQuota';
import type { ChatMessage, RulebookFile } from '../features/referee/types';
import { DAY_MS, ENTER_FLASH_MS, FEEDBACK_PROMPT_DELAY_MS, FEEDBACK_QUIET_AFTER_SUBMIT_DAYS, FEEDBACK_REPROMPT_DAYS, GRID_BG, MAX_ATTACHED_IMAGES, MENU_ROW_CLASS, MISSION_ACCENTS, STOPPED_TEXT, TYPEWRITER_TICK_MS } from '../features/referee/config';
import { stripThinkBlocks } from '../features/referee/chat/text';
import { consumeClientRateLimit, refundClientRateLimit } from '../features/referee/chat/clientRateLimit';
import { extractSeasonFromFilename } from '../features/referee/rulebook/season';
import { clearRefereeSessionStorage, hasSavedRefereeSession } from '../features/referee/session/storage';
import { useDeviceType } from '../features/referee/ui/useDeviceType';
import { useTransientToast } from '../features/referee/ui/useTransientToast';
import { copyText } from '../features/referee/ui/browser';
import ChatComposer from '../features/referee/chat/ChatComposer';

import { AdminAnalyticsModal, FeedbackAdminModal, FeedbackModal, JudgeCorrectionsModal, MaintenanceScreen, MarkdownMessage, PrivacyModal, RefereeLogsModal, SettingsModal, TeamWorkspaceModal } from '../features/referee/ui/lazyComponents';

import { trackQuestion, startPresence, trackRefereeUser, getDeviceId, registerSession, watchSession, logRefereeQA, removeRefereeUser, subscribeFeedbackReset, subscribeMaintenanceGate, setMaintenance } from '../lib/analytics';
import { signOut, deleteUser, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../lib/firebase';


export default function PublicRulebookAI() {
  const navigate = useNavigate();
  const location = useLocation();
  const { connectDrive, user, logout } = useAuth();
  const { t, language, isRTL, setLanguage, languages } = useLanguage();
  
  // ===== 1. Identity & session: who is signed in, kept alive across reloads.
  // Login state comes only from Firebase Auth (user) or the saved auth_user.
  // URL bypass params were removed for security, everyone must log in.
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(false);
  // Keep hasGoogleToken in sync with Firebase Auth so the
  // browserLocalPersistence session survives close/reopen the next day.
  // With no network Firebase reports no user because it cannot verify the
  // session — that must NEVER delete the saved login traces (doing so demotes
  // a logged-in user to the login button and wipes the session permanently).
  // Stale-trace cleanup still runs when online (legacy inMemory entries,
  // revoked sessions). Explicit logout/kick paths clear traces themselves.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setHasGoogleToken(true);
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setHasGoogleToken(false);
      } else {
        if (hasSavedRefereeSession()) {
          clearRefereeSessionStorage();
        }
        setHasGoogleToken(false);
      }
    });
    return () => unsub();
  }, []);

  // Logged in = Firebase says so, Drive context has a user, or a saved login
  // trace exists (the offline case above). Entry UI gates on this, never on
  // Firebase alone — real enforcement stays server-side in security rules.
  const sessionAlive = hasGoogleToken || !!user || hasSavedRefereeSession();

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
  // Personal time-of-day greeting for the hero. Shown only with a real
  // name — generic fallbacks ('משתמש', email fragments) stay silent.
  const heroGreeting = useMemo(() => {
    const raw = (displayUser as any)?.name || '';
    const first = String(raw).trim().split(/\s+/)[0] || '';
    if (!first || first === 'משתמש' || first === 'חבר קבוצה' || /[@.]/.test(first)) return null;
    const h = new Date().getHours();
    const key = h >= 5 && h < 12 ? 'chat.greet_morning'
      : h >= 12 && h < 17 ? 'chat.greet_afternoon'
      : h >= 17 && h < 23 ? 'chat.greet_evening' : 'chat.greet_night';
    return t(key).replace('{name}', first);
  }, [displayUser, t, language]);
  const currentTeamMember = useMemo(() => {    const firebaseUser = auth.currentUser;
    if (!user && !firebaseUser) return null;
    return {
      uid: user?.uid || firebaseUser?.uid || '',
      name: user?.name || firebaseUser?.displayName || displayUser?.name || 'חבר קבוצה',
      email: user?.email || firebaseUser?.email || displayUser?.email || '',
    };
  }, [user, displayUser]);
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

  // ===== 2. Overlays, menus & toast: open/close state only, no data.
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showLangMenu, setShowLangMenu] = useState<boolean>(false);
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showSettingsFeedback, setShowSettingsFeedback] = useState<boolean>(false);
  const [showTeamWorkspace, setShowTeamWorkspace] = useState(false);
  const [teamWorkspaceId, setTeamWorkspaceId] = useState(() => getActiveTeamId());
  const [maintenance, setMaintenanceState] = useState<boolean>(false);
  useEffect(() => {
    return subscribeMaintenanceGate(setMaintenanceState);
  }, []);
  // In-site toast (replaces blocking alert popups).
  const { toast, showToast } = useTransientToast();

  const [langPos, setLangPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const userMenuRef = useRef<HTMLDivElement>(null);
  const langBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      // While the language dropdown is open, keep the user menu alive underneath it
      if (showLangMenu) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu, showLangMenu]);

  const openLangMenu = () => {
    const rect = langBtnRef.current?.getBoundingClientRect();
    if (rect) {
      // Panel opens to the LEFT of the language button. Falls back to the
      // left viewport edge when there is no room (small screens).
      // Top is clamped so the panel always ends with a bottom margin.
      const panelW = 208;
      const panelH = window.innerHeight * 0.5;
      const right = Math.min(
        Math.max(12, window.innerWidth - rect.left + 8),
        Math.max(12, window.innerWidth - panelW - 12)
      );
      setLangPos({
        top: Math.max(12, Math.min(rect.top - 8, window.innerHeight - panelH - 16)),
        right,
      });
    }
    setShowLangMenu(true);
  };

  // ===== 3. Entry flow: intro -> mandatory disclaimer -> chat.
  const [loginError, setLoginError] = useState<string | null>(null);
  // First paint: if we arrived via ?enter=chat with saved auth in localStorage,
  // start inside the chat immediately so there is no intro flash while
  // Firebase Auth restores asynchronously. The effect below confirms and
  // clears the URL once the real auth state arrives.
  const [autoEnter] = useState<boolean>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('enter') !== 'chat') return false;
      return hasSavedRefereeSession();
    } catch { return false; }
  });
  const [showIntro, setShowIntro] = useState<boolean>(() => !autoEnter);
  const [chatStarted, setChatStarted] = useState<boolean>(() => autoEnter);
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(() => autoEnter);
  const [pendingEnterChat, setPendingEnterChat] = useState<boolean>(() => autoEnter);
  // Golden reveal flash: completes the divine login transition. Fades out
  // over the freshly mounted chat while the disclaimer descends above it.
  const [enterFlash, setEnterFlash] = useState<boolean>(() => autoEnter);
  useEffect(() => {
    if (!enterFlash) return;
    const t = setTimeout(() => setEnterFlash(false), ENTER_FLASH_MS);
    return () => clearTimeout(t);
  }, [enterFlash]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [showAdminAnalytics, setShowAdminAnalytics] = useState<boolean>(false);
  const [showRefereeLogs, setShowRefereeLogs] = useState<boolean>(false);
  const [showJudgeCorrections, setShowJudgeCorrections] = useState<boolean>(false);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceType = useDeviceType();
  
  // Persist the Firebase-restored profile photo: the chat bubbles read
  // localStorage, which doesn't roam across devices — without this sync a
  // Google photo visible in the user menu never reaches the bubbles on a
  // fresh device.
  useEffect(() => {
    try {
      const pic = (displayUser as any)?.picture || '';
      if (pic && localStorage.getItem('user_picture') !== pic) {
        localStorage.setItem('user_picture', pic);
      }
    } catch {}
  }, [displayUser]);
  const [gravatarPic, setGravatarPic] = useState('');

  // Email+password logins carry no Google photo: use the account's Gravatar
  // when nothing else is available (a missing Gravatar keeps the initial).
  useEffect(() => {
    let cancelled = false;
    try {
      if ((displayUser as any)?.picture || localStorage.getItem('user_picture') || gravatarPic) return;
      const email = String((displayUser as any)?.email || '');
      if (!email.includes('@')) return;
      (async () => {
        const url = await gravatarUrlForEmail(email);
        if (!url || cancelled) return;
        if (await probeImage(url)) {
          if (cancelled) return;
          try { localStorage.setItem('user_picture', url); } catch {}
          setGravatarPic(url);
        }
      })();
    } catch {}
    return () => { cancelled = true; };
  }, [displayUser, gravatarPic]);

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

  // Auto-enter chat after login — always show mandatory disclaimer before entering.
  // The intro is hidden right away so the disclaimer sits over the referee
  // itself, never over the intro screen.
  // Listens to location.search too: the URL can change while mounted, and the
  // auth state can arrive after navigation, so re-check on every change.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('enter') && params.get('enter') === 'chat' && sessionAlive) {
      window.history.replaceState({}, '', '/');
      setShowIntro(false);
      setChatStarted(true);
      setPendingEnterChat(true);
      setShowDisclaimer(true);
    }
  }, [user, hasGoogleToken, sessionAlive, location.search]);

  const [typewriterReady, setTypewriterReady] = useState<boolean>(false);

  const handleDisclaimerConfirm = () => {
    // No animation on the chat itself. The disclaimer modal slides down
    // beautifully and the chat is simply already there underneath it.
    if (pendingEnterChat) {
      window.history.replaceState({}, '', '/');
      setPendingEnterChat(false);
    }
    setShowDisclaimer(false);
    setShowIntro(false);
    setChatStarted(true);
    setTypewriterReady(true);
  };

  const handleIntroContinue = () => {
    if (sessionAlive) {
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

  // Feedback popup frequency control - never too often:
  // at most once every 14 days per user, and no new prompt for 45 days
  // after submitting. Keys are per-user (not per-device) so shared
  // devices (e.g. a classroom tablet) prompt each user on their own cadence.
  const feedbackTimerKey = (base: string): string => {
    const uid = resolveRefereeUid() || 'anon';
    return `${base}_${uid}`;
  };
  // Server-side global reset (owner): local timers older than it are ignored.
  const feedbackResetAtRef = useRef<number>(0);
  useEffect(() => {
    return subscribeFeedbackReset((ts) => { feedbackResetAtRef.current = ts; });
  }, []);
  const maybePromptFeedback = () => {
    if (showFeedback) return;
    const now = Date.now();
    const resetAt = feedbackResetAtRef.current || 0;
    const lastPromptRaw = parseInt(localStorage.getItem(feedbackTimerKey('referee_feedback_last_prompt')) || '0', 10);
    const submittedAtRaw = parseInt(localStorage.getItem(feedbackTimerKey('referee_feedback_submitted_at')) || '0', 10);
    const lastPrompt = lastPromptRaw > resetAt ? lastPromptRaw : 0;
    const submittedAt = submittedAtRaw > resetAt ? submittedAtRaw : 0;
    if (submittedAt && now - submittedAt < FEEDBACK_QUIET_AFTER_SUBMIT_DAYS * DAY_MS) return;
    if (lastPrompt && now - lastPrompt < FEEDBACK_REPROMPT_DAYS * DAY_MS) return;
    localStorage.setItem(feedbackTimerKey('referee_feedback_last_prompt'), String(now));
    feedbackTimeoutRef.current = setTimeout(() => {
      setShowFeedback(true);
    }, FEEDBACK_PROMPT_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  /** Sign out everywhere and reset to a fresh intro screen. */
  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {}
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('auth_user');
    setHasGoogleToken(false);
    setShowLogoutConfirm(false);
    // Back to the main intro page with a fresh chat
    setMessages([]);
    setChatStarted(false);
    setTypewriterReady(false);
    navigate('/');
  };

  // ===== 4. Account deletion (password re-auth, then wipe everything).
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * Delete the account after password re-authentication: user doc, RTDB
   * traces, then the Auth user itself, then every local trace and a reset
   * to the intro screen.
   */
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
    // RTDB cleanup must happen BEFORE deleteUser signs us out: afterwards
    // there is no auth left and the server denies these writes, leaving
    // stale session/stats entries behind.
    try {
      await rtdbRemove(rtdbRef(rtdb, `referee/sessions/${uid}`));
    } catch { /* session may not exist */ }
    await removeRefereeUser(uid);
    try {
      await deleteUser(current);
    } catch {
      setDeletingAccount(false);
      setDeleteError('מחיקת החשבון נכשלה. התחברו מחדש ונסו שוב.');
      return;
    }
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
    navigate('/');
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
  // ===== 5. Chat state: messages, input, rulebook files, request flags.
  const [seasonName, setSeasonName] = useState<string>('UNKNOWN');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // WhatsApp-style reply: quoted answer context for a follow-up question.
  const [replyTo, setReplyTo] = useState<{ text: string } | null>(null);
  // Attached user photos (max 3, images only, sent full-resolution).
  // Preview URLs stay alive for the session so sent bubbles keep showing them.
  const [attachedImages, setAttachedImages] = useState<{ file: File; url: string }[]>([]);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeRulebookFiles, setActiveRulebookFiles] = useState<RulebookFile[]>([]);

  const [isLearning, setIsLearning] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestFinishedRef = useRef(false);
  const stopHandledRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Grow the composer with its content (up to 5 lines), shrink back on send.
  const autoresizeComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  };
  useEffect(() => { autoresizeComposer(); }, [input]);

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
  const [renderingResponse, setRenderingResponse] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!typewriterReady) return;
      setTypewriterCount(prev => {
        if (prev >= typewriterTargetRef.current) return prev;
        return prev + 1;
      });
    }, TYPEWRITER_TICK_MS);
    return () => clearInterval(interval);
  }, [typewriterReady]);

  useEffect(() => {
    if (loading) {
      setTypewriterCount(0);
      typewriterTargetRef.current = 0;
    }
  }, [loading]);

  // Fresh typing session whenever a new chat begins or the gate opens.
  // (Previously two identical effects; one covers both dependency sets.)
  useEffect(() => {
    if (chatStarted && typewriterReady) {
      setTypewriterCount(0);
      typewriterTargetRef.current = 0;
    }
  }, [chatStarted, typewriterReady]);

  useEffect(() => {
    if (!chatStarted) setTypewriterReady(false);
  }, [chatStarted]);

  const isAiBusy = loading || renderingResponse;

  useEffect(() => {
    const typewriterDone = typewriterReady && typewriterTargetRef.current > 0 && typewriterCount >= typewriterTargetRef.current;
    if (renderingResponse && (!typewriterReady || typewriterDone)) {
      setRenderingResponse(false);
      requestFinishedRef.current = false;
      abortControllerRef.current = null;
    }
  }, [renderingResponse, typewriterReady, typewriterCount]);

  useEffect(() => {
    // Rulebook metadata is not needed on the landing screen. Waiting until
    // chat opens avoids downloading the R2 administration SDK on first paint.
    if (!chatStarted) return;
    const unsubSettings = onSnapshot(doc(db, 'app_config', 'rulebook'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.current_season && data.current_season !== seasonName) {
          setSeasonName(data.current_season);
        }
        fetchLatestRulebook();
      } else {
        fetchLatestRulebook();
      }
    });

    return () => unsubSettings();
  }, [chatStarted, seasonName]);

  /**
   * Load the newest rulebook files from R2 (latest 5) and detect the season
   * from their filenames, syncing it back to the shared config when it changes.
   */
  const fetchLatestRulebook = async () => {
    try {
      let files = [];
      try {
        const { s3Client, R2_BUCKET_NAME, ListObjectsV2Command } = await import('../lib/r2');
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
          }
        } else if (seasonName !== 'UNKNOWN') {
          setSeasonName('UNKNOWN');
          try {
            await updateDoc(doc(db, 'app_config', 'rulebook'), {
              current_season: 'UNKNOWN',
              last_updated: Date.now()
            });
          } catch (e) {}
        }
      } else {
        setIsLearning(false);
      }
    } catch (err) {
      console.error("Failed to fetch rulebook:", err);
      setIsLearning(false);
    }
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
        const { s3Client, R2_BUCKET_NAME, ListObjectsV2Command } = await import('../lib/r2');
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

  /**
   * Upload a rulebook PDF to R2, render its pages to images for the judge,
   * clear replaced versions, detect a season change, and refresh the list.
   */
  const performUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const [{ Upload }, { s3Client, R2_BUCKET_NAME, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand }, { convertPdfToImages }] = await Promise.all([
        import('@aws-sdk/lib-storage'),
        import('../lib/r2'),
        import('../services/geminiService'),
      ]);
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
              if (last?.role === 'model' && last.isProgress) {
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
              if (last?.role === 'model' && last.isProgress) {
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
          if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].isProgress) {
            newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: 'למדתי את העדכונים מקובץ החוקים! המידע נשמר בענן ומוכן לשימוש מכל מכשיר.' };
            delete newMsgs[newMsgs.length - 1].isProgress;
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


  const handleStop = () => {
    if (stopHandledRef.current) return;
    stopHandledRef.current = true;
    requestFinishedRef.current = false;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    typewriterTargetRef.current = 0;
    setTypewriterCount(0);
    setRenderingResponse(false);
    refundClientRateLimit();
    setMessages(prev => {
      const trimmed = prev[prev.length - 1]?.role === 'model' ? prev.slice(0, -1) : prev;
      return [...trimmed, { role: 'model', text: STOPPED_TEXT }];
    });
  };

  /**
   * Attach user photos (images only, max 3, full resolution — no downscale).
   * Preview URLs are created here and live for the session (sent bubbles
   * reuse them; nothing is revoked mid-session).
   */
  const handleAttachImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    const images = picked.filter(f => f.type.startsWith('image/'));
    if (images.length < picked.length) showToast(t('chat.imagesOnly'));
    if (!images.length) return;
    if (attachedImages.length + images.length > MAX_ATTACHED_IMAGES) {
      showToast(t('chat.maxImages'));
    }
    setAttachedImages(prev => {
      const room = Math.max(0, MAX_ATTACHED_IMAGES - prev.length);
      return [...prev, ...images.slice(0, room).map(file => ({ file, url: URL.createObjectURL(file) }))];
    });
  };
  const removeAttachedImage = (url: string) => {
    setAttachedImages(prev => prev.filter(a => a.url !== url));
  };

  /**
   * Send the input (or a tapped suggestion) to the referee: input guards,
   * anti-spam rate limits, then a streamed answer appended chunk by chunk.
   * On success the question is counted, logged, and may trigger the feedback
   * popup. Abort via handleStop: partial text is dropped and the quota refunded.
   */
  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;

    if ((!textToSend.trim() && !attachedImages.length) || isAiBusy) return;

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

    // Fast browser guard first; Firestore's daily quota remains authoritative.
    const clientLimit = consumeClientRateLimit();
    if (!clientLimit.allowed) {
      setMessages(prev => [...prev, { role: 'model', text: clientLimit.message || 'נסו שוב מאוחר יותר.' }]);
      return;
    }

    // Server-enforced daily budget: consumes one unit from chat_quota/{uid}.
    // Rules enforce strictly-+1 inside a rolling 24h window with a hard cap,
    // so clearing localStorage or switching devices cannot dodge it.
    const quotaUid = resolveRefereeUid();
    if (quotaUid) {
      try {
        await consumeChatQuota(quotaUid);
      } catch (error) {
        setMessages(prev => [...prev, { role: 'model', text: error instanceof Error ? error.message : 'הגעתם למכסת השאלות היומית. נסו שוב מחר.' }]);
        return;
      }
    }

    const userMessage = textToSend.trim();

    // WhatsApp-style reply: quoted answer travels as prompt context and as
    // a visible quote on the sent bubble. Captured here, cleared on send.
    const replyContext = replyTo
      ? `(הקשר: המשתמש ממשיך ושואל שאלת המשך על התשובה הקודמת הבאה: "${replyTo.text.slice(0, 800)}")\n\n`
      : null;
    const replyQuote = replyTo ? replyTo.text.slice(0, 220) : undefined;

    // Attached photos travel to the model full-resolution and stay visible
    // on the sent bubble via their session preview URLs.
    const photosToSend = attachedImages;
    setAttachedImages([]);

    setInput('');
    setReplyTo(null);

    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        text: userMessage,
        ...(replyQuote ? { quote: replyQuote } : {}),
        ...(photosToSend.length ? { files: photosToSend.map(a => ({ url: a.url, key: a.file.name })) } : {})
      }
    ]);
    
    setLoading(true);
    resetThinkCycle();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    requestFinishedRef.current = false;
    stopHandledRef.current = false;
    setRenderingResponse(false);
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch(e) {}

    try {
      const finalPrompt = (replyContext || '') + userMessage + "\n\n(הנחיה לשופט: אם השאלה עוסקת במשימה חדשה או מצב חדש - התעלם מהמשימה שנדונה קודם לכן ואל תערבב בין חוקים או ניקודים של משימות שונות.)";
      
      const { GeminiService } = await import('../services/geminiService');
      const response = await GeminiService.askRulebook(
        finalPrompt,
        messages,
        activeRulebookFiles,
        seasonName,
        photosToSend.map(a => ({ url: '' as string, key: a.file.name, actualFile: a.file })),
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
        language,
        controller.signal
      );
      
      if (controller.signal.aborted) {
        handleStop();
      } else {
        // Owner questions are invisible to analytics: not counted and not
        // logged to the journal.
        // Count only questions that actually got an answer: stopped or
        // failed requests never reach here, so they are not counted.
        if (!isCurrentUserOwner()) {
          trackQuestion(resolveRefereeUid() || 'anon');
          logRefereeQA({
            question: userMessage,
            answer: stripThinkBlocks(response) || response || t('chat.commError'),
            season: seasonName,
            language,
            uid: resolveRefereeUid(),
            model: 'gemini-3.6-flash',
            ok: true,
          });
        }
        if (teamWorkspaceId && currentTeamMember) {
          void saveTeamQuestion(teamWorkspaceId, {
            question: userMessage,
            answer: stripThinkBlocks(response) || response || t('chat.commError'),
            season: seasonName,
            language,
            authorUid: currentTeamMember.uid,
            authorName: currentTeamMember.name || currentTeamMember.email,
          }).catch(error => console.warn('Team question save failed:', error));
        }
        requestFinishedRef.current = true;
        setRenderingResponse(true);
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'model') return prev;
          return [...prev, { role: 'model', text: response || t('chat.commError') }];
        });
        maybePromptFeedback();
      }
    } catch (error: any) {
      if (controller.signal.aborted) {
        handleStop();
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
      if (!requestFinishedRef.current) abortControllerRef.current = null;
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
  const heroActive = chatStarted && messages.length === 0 && !loading;

  const heroIcons = [ListOrdered, Hand, Cog, Users];

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
      initial={false}
      className="h-screen h-[100dvh] w-full flex flex-col bg-slate-950 overflow-hidden relative font-sans" dir="rtl"
    >
      {/* Subtle grid backdrop: repeating inline SVG tile. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `url("${GRID_BG}")`, backgroundSize: '56px 56px', backgroundRepeat: 'repeat' }}
        aria-hidden
      />
      {/* A faint dark wash on top so the chat cards on top remain readable. */}
      <div className="absolute inset-0 bg-slate-950/[0.55]" aria-hidden />
      {/* Brand watermark: the referee logo, large and centered behind everything.
          Masked so its edges melt into the background. Already cached via hero. */}
      <img
        src="/logoref.png"
        alt=""
        aria-hidden
        draggable={false}
        loading="eager"
        decoding="async"
        className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[min(80vw,560px)] opacity-10 pointer-events-none select-none"
        style={{ maskImage: 'radial-gradient(circle, black 55%, transparent 78%)', WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 78%)' }}
      />
      {/* Subtle veils at top + bottom so the field fades into the UI chrome. */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
      {/* FLL identity strip: blue / yellow / red */}
      <div className="h-1 bg-gradient-to-l from-[#0B6BCB] via-[#FFC400] to-[#E1251B] w-full shrink-0 relative z-10" />

      {/* Header - dark glass, premium AI console */}
      <div className="border-b border-white/10 bg-slate-900/70 backdrop-blur-xl z-30 shadow-[0_8px_32px_rgba(0,0,0,0.35)] shrink-0 relative">
        {/* Row 1: Logo + Title + User */}
        <div className="px-2 py-1.5 md:px-4 md:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 md:gap-3">
            <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-white flex items-center justify-center shrink-0 ring-1 ring-white/25 overflow-hidden">
              <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain select-none" />
            </div>
            <div className="min-w-0">
                <h1 className="text-sm md:text-xl font-black text-white tracking-tight cursor-default select-none leading-tight">
                  {t('app.title')}
                </h1>
              <div className="flex md:hidden items-center gap-1.5 mt-1">
                {(!isLearning && seasonName === 'UNKNOWN') ? null : (
                  <span className="relative whitespace-nowrap">
                    <span aria-hidden className={`absolute -inset-1 rounded-full blur-md ${isLearning ? 'bg-gradient-to-l from-amber-300/40 via-yellow-400/10 to-amber-300/40' : 'bg-gradient-to-l from-emerald-300/40 via-teal-400/10 to-cyan-300/40'}`} />
                    <span className={`relative block rounded-full p-px ${isLearning ? 'bg-gradient-to-l from-amber-300/80 via-yellow-200/30 to-amber-300/80' : 'bg-gradient-to-l from-emerald-300/80 via-teal-200/30 to-cyan-300/80'}`}>
                      <span className="block rounded-full bg-[#0B1526] px-2 py-px">
                        <span className="text-[10px] font-black text-slate-100">
                          {isLearning ? t('chat.updating') : seasonName}
                        </span>
                      </span>
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center min-w-0 px-4">
            {(!isLearning && seasonName === 'UNKNOWN') ? null : (
              <div className="relative whitespace-nowrap">
                <div aria-hidden className={`absolute -inset-1 rounded-full blur-md ${isLearning ? 'bg-gradient-to-l from-amber-300/40 via-yellow-400/10 to-amber-300/40' : 'bg-gradient-to-l from-emerald-300/40 via-teal-400/10 to-cyan-300/40'}`} />
                <div className={`relative rounded-full p-px ${isLearning ? 'bg-gradient-to-l from-amber-300/80 via-yellow-200/30 to-amber-300/80' : 'bg-gradient-to-l from-emerald-300/80 via-teal-200/30 to-cyan-300/80'}`}>
                  <div className="rounded-full bg-[#0B1526] px-4 py-1.5">
                    <span className={`text-sm font-black text-slate-100 ${isLearning ? '' : 'tracking-[0.18em]'}`} dir="ltr">
                      {isLearning ? t('chat.updating') : seasonName}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 md:gap-3">
            {sessionAlive && displayUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="flex items-center gap-2 md:gap-3 p-1 md:p-1.5 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
                >
                  <div className="hidden sm:flex flex-col items-end text-right">
                    <span className="text-xs font-black text-white max-w-[120px] truncate leading-none">{displayUser.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]" dir="ltr">
                      {displayUser.email}
                    </span>
                  </div>
                  {displayUser.picture || gravatarPic ? (
                    <img
                      src={displayUser.picture || gravatarPic}
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
                        {displayUser.picture || gravatarPic ? (
                          <img src={displayUser.picture || gravatarPic} alt="" className="w-10 h-10 rounded-full border-2 border-slate-950 object-cover" />
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
                          className={MENU_ROW_CLASS}
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
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowPrivacy(true);
                          }}
                          className={MENU_ROW_CLASS}
                        >
                          <Shield className="w-4 h-4 text-slate-500" />
                          פרטיות
                        </button>
                        {isCurrentUserOwner() && (
                          <button
                            onClick={() => { setShowUserMenu(false); setShowSettings(true); }}
                            className={MENU_ROW_CLASS}
                          >
                            <Settings className="w-4 h-4 text-slate-500" />
                            הגדרות
                          </button>
                        )}
                        <button
                          onClick={() => { setShowUserMenu(false); setShowTeamWorkspace(true); }}
                          className={MENU_ROW_CLASS}
                        >
                          <Users className="w-4 h-4 text-[#0B6BCB]" />
                          מרחב הקבוצה
                        </button>
                        {auth.currentUser && !auth.currentUser.emailVerified && isCurrentUserOwner() && (
                          <button
                            onClick={async () => {
                              setShowUserMenu(false);
                              try {
                                const { sendEmailVerification } = await import('firebase/auth');
                                const fbUser = auth.currentUser;
                                if (fbUser) {
                                  await sendEmailVerification(fbUser);
                                  showToast('קישור אימות נשלח לאימייל הבעלים. לחצו עליו לפני פריסת החוקים.');
                                }
                              } catch {
                                showToast('לא הצלחתי לשלוח. נסו שוב מאוחר יותר.');
                              }
                            }}
                            className={MENU_ROW_CLASS}
                          >
                            <MailCheck className="w-4 h-4 text-amber-500" />
                            <span className="flex-1">שלח קישור אימות לבעלים</span>
                          </button>
                        )}
                        <div className="h-px bg-white/60 my-1" />
                        <button
                          onClick={() => { setShowUserMenu(false); setShowRefereeLogs(true); }}
                          className={MENU_ROW_CLASS}
                        >
                          <ScrollText className="w-4 h-4 text-slate-500" />
                          יומן שופטים
                        </button>
                        <div className="h-px bg-white/60 my-1" />
                        <button
                          ref={langBtnRef}
                          onClick={openLangMenu}
                          className={MENU_ROW_CLASS}
                        >
                          <Globe className="w-4 h-4 text-slate-500" />
                          <span className="flex-1">שפה</span>
                          <span className="text-[11px] text-slate-500 font-bold">{languages.find(l => l.code === language)?.native}</span>
                          <ChevronLeft className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                      <div className="px-3 py-2 bg-white/40 border-t border-white/50 text-center">
                        <span className="text-[10px] font-bold text-slate-500">נבנה בהתנדבות על ידי קבוצת Boeing 727 · גרסה {
                          // @ts-ignore build-time define, may be absent in some environments
                          typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : '?'
                        }</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={sessionAlive ? () => setShowLogoutConfirm(true) : () => navigate('/login')}
                className="text-xs bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 font-black px-3 py-2 md:px-3.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(250,204,21,0.3)] active:scale-95 cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <span>{sessionAlive ? t('auth.logout') : t('auth.login')}</span>
              </button>
            )}
            <div className="inline-flex items-center gap-2 md:gap-3 px-2 py-1 md:px-4 md:py-2 bg-gradient-to-l from-yellow-400/10 to-white/[0.04] backdrop-blur-xl rounded-xl border border-yellow-400/25 group hover:bg-yellow-400/15 hover:border-yellow-400/50 hover:shadow-[0_0_20px_rgba(250,204,21,0.25)] transition-all duration-300 whitespace-nowrap shrink-0 select-none">
              <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-6 md:h-10 w-auto object-contain rounded-full ring-1 ring-yellow-400/50 shadow-[0_0_12px_rgba(250,204,21,0.3)] group-hover:scale-110 transition-transform" />
              <div className="hidden sm:block h-4 md:h-8 w-px bg-yellow-400/25" />
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-[6px] md:text-[10px] font-black text-yellow-400/80 uppercase tracking-[0.15em] select-none">Developed By</span>
                <span className="text-[9px] md:text-base font-black text-white italic leading-tight">Boeing <span className="text-red-500">727</span><span className="text-slate-500 font-bold text-[7px] md:text-xs mx-px">&</span><span className="text-slate-400 font-bold not-italic text-[7px] md:text-xs">Yuval Margalit</span></span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Golden reveal flash after login transition */}
      {enterFlash && (
        <motion.div
          initial={{ opacity: 0.45 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed inset-0 z-[9000] bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.8)_0%,rgba(250,204,21,0.4)_50%,rgba(250,204,21,0.1)_78%,transparent_100%)]"
          aria-hidden
        />
      )}

      {/* Chat Area - premium AI console, full screen */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth relative z-10" ref={scrollRef}>
        <div className="w-full px-3 md:px-10 py-4 md:py-8 space-y-4 md:space-y-6">
        {heroActive && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col items-center text-center max-w-2xl mx-auto"
          >
            {/* Soft FIRST-color glow behind the hero (no boxes, no borders). */}
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-[#FFC400]/10 blur-3xl" />
            </div>

            {/* Logo — bigger, sits on a soft halo */}
            <div className="relative mb-5">
              <div className="absolute inset-0 -m-2 rounded-full bg-[#FFC400]/[0.07] blur-xl" aria-hidden />
              <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-[24px] bg-white ring-1 ring-white/30 overflow-hidden shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
                <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain select-none" />
              </div>
            </div>

            <p className="text-[10px] md:text-[11px] font-black tracking-[0.45em] text-[#7FB8EC]" dir="ltr">
              FIRST&nbsp;LEGO&nbsp;LEAGUE&nbsp;·&nbsp;VIRTUAL&nbsp;REFEREE
            </p>
            {heroGreeting && (
              <p className="text-sm md:text-base font-bold text-amber-300/90 mt-3">
                {heroGreeting}
              </p>
            )}
            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight mt-2">
              {t('intro.subtitle')}
            </h2>
            <p className="text-sm md:text-base text-slate-300 font-medium mt-2 max-w-lg leading-relaxed px-2">
              {t('intro.descFull')}
            </p>

            {/* Mission cards: clean, each with a 3px FLL accent stripe at the top */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7 w-full">
              {quickQuestions.map((q, i) => {
                const Icon = heroIcons[i % heroIcons.length];
                const accent = MISSION_ACCENTS[i % MISSION_ACCENTS.length];
                return (
                  <button
                    key={i}
                    onClick={() => handleSend(q)}
                    disabled={isAiBusy || isLearning}
                    style={{ borderTopColor: accent }}
                    className="group relative flex items-center gap-4 text-right px-5 py-4 rounded-2xl bg-[#0E2238] border border-t-[3px] border-x-white/10 border-b-white/10 hover:bg-[#142a47] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span
                      style={{ color: accent }}
                      className="shrink-0 w-11 h-11 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center"
                    >
                      <Icon className="w-6 h-6" />
                    </span>
                    <span className="text-[15px] md:text-base font-bold text-white leading-relaxed">
                      {q}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
        {messages.map((msg, idx) => {
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
            typewriterTargetRef.current = finalRenderText.split(/(\s+)/).length;
          }
          const isTypewriting = idx === messages.length - 1 && msg.role === 'model' && typewriterReady && typewriterCount < typewriterTargetRef.current;
          // Live-answer glow: bubble, glow bar and avatar light up while text streams.
          const isLiveAnswer = isTypewriting;
          if (isTypewriting) {
            finalRenderText = finalRenderText.split(/(\s+)/).slice(0, typewriterCount).join('');
          }
          // Before the gate opens, hide the last model message entirely so the
          // greeting never flashes fully before typing from the start.
          if (idx === messages.length - 1 && msg.role === 'model' && !typewriterReady && chatStarted) {
            finalRenderText = '';
          }

          if (isThinking) {
            return (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5 md:gap-3">
                <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full bg-white ring-1 ring-white/25 overflow-hidden flex items-center justify-center">
                  <img src="/logoref.png" alt="" className="w-full h-full object-contain" />
                </div>
                <div className="bg-[#0E1628] border border-white/10 px-4 py-3 rounded-2xl flex flex-col items-center gap-2 max-w-[85%] md:max-w-[75%]">
                  <ThinkIndicator />
                  {thinkContent && (
                    <div className="text-[10px] md:text-xs font-mono text-slate-500 whitespace-pre-wrap max-h-48 overflow-y-auto">
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
              className={`flex gap-2.5 md:gap-3.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Referee or User Avatar */}
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                {msg.role === 'user' ? (
                  (user?.picture || displayUser?.picture || gravatarPic || localStorage.getItem('user_picture')) ? (
                    <img src={user?.picture || displayUser?.picture || gravatarPic || localStorage.getItem('user_picture') || ''} alt="" className="w-full h-full object-cover rounded-full ring-1 ring-white/20" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-[#0B6BCB] flex items-center justify-center">
                      <span className="text-xs md:text-sm font-black text-white">
                        {(displayUser?.name || 'U').trim().charAt(0)}
                      </span>
                    </div>
                  )
                ) : (
                  <div className={`w-full h-full rounded-full bg-white overflow-hidden transition-all duration-500 ${isLiveAnswer ? 'ring-2 ring-[#E1251B]/80 shadow-[0_0_18px_rgba(225,37,27,0.55)]' : 'ring-1 ring-white/25'}`}>
                    <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain" />
                  </div>
                )}
              </div>

              <div className={`flex flex-col gap-1.5 md:gap-2 min-w-0 ${msg.role === 'user' ? 'max-w-[85%] md:max-w-[70%] items-end' : 'min-w-0 max-w-3xl'}`}>
                <div className={`relative overflow-hidden transition-all duration-500 ${
                  msg.role === 'user'
                    ? 'bg-[#0B6BCB] text-white rounded-2xl px-3.5 py-2.5 md:px-4 md:py-3'
                    : `bg-gradient-to-b from-[#111f38] to-[#0E1628] border text-slate-100 rounded-2xl px-4 py-3 md:px-5 md:py-4 ${
                        isLiveAnswer
                          ? 'border-[#E1251B]/40 shadow-[0_0_36px_rgba(225,37,27,0.22)]'
                          : 'border-white/10 shadow-[0_10px_32px_rgba(0,0,0,0.45)]'
                      }`
                }`}>
                  {/* Referee glow bar */}
                  {msg.role !== 'user' && (
                    <span aria-hidden className={`absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-[#E1251B] via-[#ff6b5e] to-[#E1251B]/30 transition-all duration-500 ${isLiveAnswer ? 'shadow-[0_0_16px_rgba(225,37,27,0.95)]' : 'shadow-[0_0_8px_rgba(225,37,27,0.5)]'}`} />
                  )}

                  {/* Referee Tag */}
                  {msg.role !== 'user' && (
                    <div className="flex items-center gap-1.5 mb-1.5 md:mb-2">
                      <span className="text-[10px] md:text-[11px] font-black text-red-100 bg-[#E1251B]/15 border border-[#E1251B]/40 shadow-[0_0_12px_rgba(225,37,27,0.25)] px-2 py-0.5 rounded-full flex items-center gap-1">
                         {t('chat.refereeTag')}
                      </span>
                      {finalRenderText.includes("שריקה") && (
                        <span className="text-[10px] md:text-[11px] font-black text-white bg-[#E1251B] px-2 py-0.5 rounded-full">
                            {t('chat.foulTag')}
                        </span>
                      )}
                    </div>
                  )}

                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {msg.files.map((file, fIdx) => (
                        <div key={fIdx} className="relative w-16 h-16 md:w-28 md:h-28 group">
                      {(file.key.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.base64?.startsWith('data:image')) ? (
                          <img src={file.url} alt="Attached" className="w-full h-full object-cover rounded-xl border border-white/15" />
                       ) : (
                           <div className="w-full h-full flex items-center justify-center bg-white/[0.06] rounded-xl border border-white/10">
                                 <FileText className="w-6 h-6 md:w-8 md:h-8 text-slate-400" />
                              </div>
                           )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`text-[15px] md:text-[16px] leading-relaxed ${msg.role === 'user' ? 'font-medium' : 'font-normal'}`}>
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap">
                        {msg.quote && (
                          <div className="mb-1.5 rounded-lg border-r-2 border-white/60 bg-black/25 px-2.5 py-1.5 text-xs text-blue-100/90 line-clamp-3 text-right">
                            {msg.quote}
                          </div>
                        )}
                        {msg.text}
                      </div>
                    ) : (
                      <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-p:my-2 prose-p:text-slate-100 prose-headings:font-bold prose-headings:text-white prose-headings:mt-3 prose-headings:mb-1.5 prose-a:text-[#7FB8EC] prose-strong:text-[#FFC400] prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 prose-li:text-slate-200 rtl:text-right">
                        <Suspense fallback={<span>{finalRenderText}</span>}><MarkdownMessage
                          components={{
                            em: ({children, ...props}) => {
                              const txt = typeof children === 'string' ? children : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string' ? children[0] : null;
                              if (txt === '▍') return <span className="typewriter-cursor" aria-hidden>▍</span>;
                              return <em {...props}>{children}</em>;
                            }
                          }}
                        >
                          {isTypewriting ? finalRenderText + '\u200B*\u258D*' : finalRenderText}
                        </MarkdownMessage></Suspense>
                      </div>
                    )}
                  </div>
                </div>
                {msg.role === 'model' && idx > 0 && msg.text !== STOPPED_TEXT && (
                  <div className="flex items-center gap-1.5 px-0.5">
                    <button
                      onClick={async () => {
                        if (await copyText(finalRenderText)) {
                          showToast(t('chat.copied'));
                        }
                      }}
                      className="text-[11px] md:text-xs font-bold text-slate-400 hover:text-white transition-all px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#E1251B]/50 hover:bg-[#E1251B]/10 hover:shadow-[0_0_12px_rgba(225,37,27,0.25)] cursor-pointer flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {t('chat.copy')}
                    </button>
                    {!isLiveAnswer && (
                      <button
                        onClick={() => {
                          setReplyTo({ text: finalRenderText.slice(0, 800) });
                          composerRef.current?.focus();
                        }}
                        className="text-[11px] md:text-xs font-bold text-slate-400 hover:text-white transition-all px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#0B6BCB]/60 hover:bg-[#0B6BCB]/15 hover:shadow-[0_0_12px_rgba(11,107,203,0.3)] cursor-pointer flex items-center gap-1.5"
                      >
                        <Reply className="w-3.5 h-3.5" />
                        {t('chat.reply')}
                      </button>
                    )}

                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5 md:gap-3">
            <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full bg-white ring-1 ring-white/25 overflow-hidden flex items-center justify-center">
              <img src="/logoref.png" alt="" className="w-6 h-6 md:w-7 md:h-7 object-contain" />
            </div>
            <div className="bg-[#0E1628] border border-white/10 px-4 py-3 rounded-2xl flex flex-col items-center gap-2">
              <ThinkIndicator />
            </div>
          </motion.div>
        )}
        </div>
      </div>

      <ChatComposer
        replyTo={replyTo}
        clearReply={() => setReplyTo(null)}
        attachments={attachedImages}
        removeAttachment={removeAttachedImage}
        attachInputRef={attachInputRef}
        onAttach={handleAttachImages}
        composerRef={composerRef}
        input={input}
        setInput={setInput}
        resize={autoresizeComposer}
        busy={isAiBusy}
        learning={isLearning}
        onSend={() => handleSend()}
        onStop={handleStop}
        t={t}
      />

      {/* ===== Floating layers: every modal/toast/drawer mounts here and
          gates itself with isOpen, so the chat tree underneath never unmounts. ===== */}

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
                <div className="text-4xl mb-2">??</div>
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
                className="w-full px-4 py-3 rounded-xl border-2 border-red-300 bg-red-50 text-slate-900 font-black text-base md:text-sm text-center tracking-widest outline-none focus:border-red-500 transition-all"
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
            isLoggedIn={sessionAlive}
            onContinue={handleIntroContinue}
            t={t}
          />
        )}
      </AnimatePresence>

      <MandatoryDisclaimerModal isOpen={showDisclaimer} onConfirm={handleDisclaimerConfirm} t={t} />
      <Suspense fallback={null}>
      {showPrivacy && <PrivacyModal isOpen onClose={() => setShowPrivacy(false)} />}
      {showSettings && <SettingsModal
        isOpen
        onClose={() => setShowSettings(false)}
        onOpenUpload={() => { setShowSettings(false); openUploadModal(); }}
        onOpenAnalytics={() => setShowAdminAnalytics(true)}
        onOpenCorrections={() => setShowJudgeCorrections(true)}
        onOpenFeedback={() => setShowSettingsFeedback(true)}
        onOpenPrivacy={() => setShowPrivacy(true)}
      />}
      {showSettingsFeedback && <FeedbackAdminModal isOpen onClose={() => setShowSettingsFeedback(false)} />}
      {showTeamWorkspace && <TeamWorkspaceModal
        isOpen
        onClose={() => setShowTeamWorkspace(false)}
        onTeamChange={team => setTeamWorkspaceId(team?.id || '')}
        currentUser={currentTeamMember || { uid: '', name: 'חבר קבוצה', email: '' }}
      />}

      {/* Owner banner while work mode is on */}
      {maintenance && isCurrentUserOwner() && (
        <div className="fixed top-12 md:top-16 left-1/2 -translate-x-1/2 z-[9500] flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full bg-amber-400 text-slate-950 shadow-[0_8px_28px_rgba(250,204,21,0.45)]" dir="rtl">
          <Wrench className="w-4 h-4" />
          <span className="text-xs font-black whitespace-nowrap">מצב עבודה פעיל</span>
          <button
            onClick={() => setMaintenance(false)}
            className="text-[11px] font-black bg-slate-950 text-amber-300 px-2.5 py-1 rounded-full hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            כבה
          </button>
        </div>
      )}

      {/* Work mode gate: everyone except the owner sees the maintenance screen */}
      {maintenance && !isCurrentUserOwner() && <MaintenanceScreen />}

      {/* In-site green toast (copy / like confirmations) */}
      <AnimatePresence>
        {toast && (
          <div className="fixed inset-x-0 bottom-24 md:bottom-28 z-[80] flex justify-center pointer-events-none px-4" dir="rtl">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500/95 backdrop-blur-xl border border-emerald-300/40 shadow-[0_8px_28px_rgba(16,185,129,0.4)]"
              role="status"
            >
              <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-emerald-600" strokeWidth={3.5} />
              </span>
              <span className="text-sm font-black text-white whitespace-nowrap max-w-[80vw] overflow-hidden text-ellipsis">{toast}</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-base md:text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-all"
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

      {showAdminAnalytics && <AdminAnalyticsModal
        isOpen
        onClose={() => setShowAdminAnalytics(false)}
      />}

      {showRefereeLogs && <RefereeLogsModal
        isOpen
        onClose={() => setShowRefereeLogs(false)}
      />}

      {showJudgeCorrections && <JudgeCorrectionsModal
        isOpen
        onClose={() => setShowJudgeCorrections(false)}
      />}

      {showFeedback && <FeedbackModal
        isOpen
        onClose={() => setShowFeedback(false)}
        onSubmit={() => {
          const uid = resolveRefereeUid() || 'anon';
          localStorage.setItem(`referee_feedback_submitted_at_${uid}`, String(Date.now()));
          setShowFeedback(false);
        }}
        season={seasonName}
        uid={resolveRefereeUid()}
      />}
      </Suspense>

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

      {/* Language floating dropdown - BizPortal style, anchored right */}
      <AnimatePresence>
        {showLangMenu && (
          <>
            <div
              onClick={() => setShowLangMenu(false)}
              className="fixed inset-0 z-[60]"
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ top: langPos.top, right: langPos.right }}
              className="fixed z-[70] w-52 max-w-[70vw] bg-white/70 backdrop-blur-2xl border border-white/60 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] overflow-hidden"
              dir="rtl"
              role="dialog"
              aria-label="שפה"
            >
              <div className="py-1 divide-y divide-slate-900/10 max-h-[50vh] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(15,23,42,0.25)_transparent]">
                {languages.map((lang) => {
                  const active = language === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => { setLanguage(lang.code); setShowLangMenu(false); setShowUserMenu(false); }}
                      className="relative w-full px-4 py-3 text-slate-700 hover:text-slate-900 font-bold text-sm text-center hover:bg-white/70 transition-colors cursor-pointer"
                    >
                      {lang.native}
                      {active && (
                        <span className="absolute bottom-2 right-4 left-4 h-[2.5px] rounded-full bg-sky-500" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
