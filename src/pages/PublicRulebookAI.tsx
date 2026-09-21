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
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { LogOut, Trash2, Shield, ChevronDown, ChevronLeft, Globe, ScrollText, Wrench, Check, Settings, MailCheck } from 'lucide-react';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/firestore';
import { rtdb } from '../lib/firebase/rtdb';
import { remove as rtdbRemove, ref as rtdbRef } from 'firebase/database';
import { getPublicUrl } from '../lib/r2Config';
import { resetThinkCycle } from '../lib/thinkCycle';
import { gravatarUrlForEmail, probeImage } from '../lib/avatar';
import ThinkIndicator from '../components/ThinkIndicator';
import { ensureSeasonIdentity, useSeasonIdentity } from '../features/referee/season/identity';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import ConfirmationModal from '../components/ConfirmationModal';
import IntroScreen from '../components/IntroScreen';
import MandatoryDisclaimerModal from '../components/MandatoryDisclaimerModal';
import ParticleBurst from '../components/ParticleBurst';
import { isCurrentUserOwner } from '../lib/owner';
import { ChatQuotaExhaustedError, consumeChatQuota, subscribeChatQuota, type ChatQuotaStatus } from '../lib/chatQuota';
import type { ChatMessage, RulebookFile } from '../features/referee/types';
import { DAY_MS, ENTER_FLASH_MS, FEEDBACK_PROMPT_DELAY_MS, FEEDBACK_QUIET_AFTER_SUBMIT_DAYS, FEEDBACK_REPROMPT_DAYS, MAX_ATTACHED_IMAGES, MENU_ROW_CLASS } from '../features/referee/config';
import { applyStopToMessages } from '../features/referee/chat/stopResponse';
import { finalizeModelResponse, resolveResponseOutcome } from '../features/referee/chat/finalizeResponse';
import { safeUserFacingError } from '../features/referee/chat/userFacingError';
import { applyStop, beginSend, beginStream, completeStream, finishRender, initialRequestMachine, settle, type RequestMachine } from '../features/referee/chat/requestMachine';
import { decideSendPreflight } from '../features/referee/chat/sendGuards';
import {
  beginDeletingAuth,
  beginRemovingData,
  beginReauth,
  cancelDeletion,
  clearDeletionError,
  completeDeletion,
  failDeletion,
  initialAccountDeletion,
  isDeleting,
  isDeletionDialogOpen,
  openDeletionConfirm,
  rejectDeletion,
  setDeletionPassword,
  type AccountDeletionState,
} from '../features/referee/session/accountDeletion';
import {
  chatStarted as entryChatStarted,
  disclaimerConfirm,
  enterFromUrl,
  exitToIntro,
  enteredChatState,
  initialEntryState,
  introContinue,
  showDisclaimer as entryShowDisclaimer,
  showIntro as entryShowIntro,
  type EntryState,
} from '../features/referee/session/entryFlow';
import { clearAllChatStates, clearChatState } from '../features/referee/chat/localHistory';
import { consumeClientRateLimit, refundClientRateLimit } from '../features/referee/chat/clientRateLimit';
import { extractSeasonFromFilename } from '../features/referee/rulebook/season';
import { createRulebookLoadBarrier } from '../features/referee/rulebook/loadBarrier';
import { selectActiveRulebookSources } from '../features/referee/rulebook/activeFiles';
import { clearRefereeSessionStorage, hasSavedRefereeSession } from '../features/referee/session/storage';
import { useVersionCheck } from '../features/referee/ui/useVersionCheck';
import { useTransientToast } from '../features/referee/ui/useTransientToast';
import { copyText } from '../features/referee/ui/browser';
import { buildMessageView, typewriterLength } from '../features/referee/chat/messageView';
import { useTypewriter } from '../features/referee/chat/useTypewriter';
import ChatMessageRow from '../features/referee/chat/ChatMessageRow';
import { SeasonStatus } from '../features/referee/ui/RefereeBackdrop';
import ChatBackdrop from '../components/ChatBackdrop';
import { MOTION } from '../features/referee/ui/motion';
import { DeleteAccountDialog, SessionKickedDialog } from '../features/referee/ui/AccountDialogs';
import ChatComposer from '../features/referee/chat/ChatComposer';
import ChatHero from '../features/referee/chat/ChatHero';
import { RulebookUploadDialog, SeasonWipeDialog } from '../features/referee/rulebook/RulebookDialogs';

import { AdminAnalyticsModal, FeedbackAdminModal, FeedbackModal, JudgeCorrectionsModal, MaintenanceScreen, PrivacyModal, RefereeLogsModal, SettingsModal } from '../features/referee/ui/lazyComponents';

import { trackQuestion, startPresence, trackRefereeUser, getDeviceId, registerSession, watchSession, logRefereeQA, removeRefereeUser } from '../lib/analytics';
import { subscribeFeedbackReset, subscribeMaintenanceGate, setMaintenance } from '../lib/refereeFlags';
import { signOut, deleteUser, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../lib/firebase/auth';


export default function PublicRulebookAI({ entryStart, onNavigateOut }: { entryStart?: 'chat'; onNavigateOut?: (to: string) => void } = {}) {
  const routerNavigate = useNavigate();
  // Embedded in the landing flow: navigations escape to the landing's
  // stage machine (logout -> intro, kicked -> login), never to a route.
  const navigate = onNavigateOut ?? routerNavigate;
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t, language, isRTL, setLanguage, languages } = useLanguage();
  
  // ===== 1. Identity & session: who is signed in, kept alive across reloads.
  // Login state comes only from Firebase Auth (user) or the saved auth_user.
  // URL bypass params were removed for security, everyone must log in.
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(false);
  const [chatQuota, setChatQuota] = useState<ChatQuotaStatus | null>(null);
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
  // Force reload when a new version is deployed so cached outdated clients get App Check
  // ===== 2. Overlays, menus & toast: open/close state only, no data.
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showLangMenu, setShowLangMenu] = useState<boolean>(false);
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showSettingsFeedback, setShowSettingsFeedback] = useState<boolean>(false);
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
  // Entry flow (intro -> disclaimer -> chat) as one state machine; the
  // render tree reads derived booleans (see entryFlow.ts).
  // Embedded same-page flow: the landing already walked intro -> login ->
  // disclaimer, so the chat mounts live with no intro takeover and no gate.
  const [entry, setEntry] = useState<EntryState>(() => (entryStart === 'chat' ? enteredChatState() : initialEntryState(autoEnter)));
  const showIntro = entryShowIntro(entry);
  const chatStarted = entryChatStarted(entry);
  const showDisclaimer = entryShowDisclaimer(entry);
  // Golden reveal flash: completes the divine login transition. Fades out
  // over the freshly mounted chat while the disclaimer descends above it.
  const [enterFlash, setEnterFlash] = useState<boolean>(() => entryStart === 'chat' ? false : autoEnter);
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
      setEntry(enterFromUrl);
    }
  }, [user, hasGoogleToken, sessionAlive, location.search]);

  const typewriterReady = entry.typewriterReady;

  // Particle handoff: confirming the gate bursts the disclaimer's own
  // elements into blue/red embers (the chat backdrop's energy colors) on a
  // canvas ABOVE the exiting stage, so they keep drifting over the freshly
  // revealed chat. Reduced motion skips the burst.
  const [entryBurst, setEntryBurst] = useState(false);
  const handleDisclaimerConfirm = () => {
    // No animation on the chat itself. The disclaimer modal slides down
    // beautifully and the chat is simply already there underneath it.
    const reduce = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) setEntryBurst(true);
    if (entry.pendingEnterChat) {
      window.history.replaceState({}, '', '/');
    }
    setEntry(disclaimerConfirm);
  };

  const handleIntroContinue = () => {
    const step = introContinue(entry, sessionAlive);
    if (step.navigateToLogin) navigate('/login');
    else setEntry(step.next);
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

  useEffect(() => {
    const uid = resolveRefereeUid();
    if (!uid) { setChatQuota(null); return; }
    return subscribeChatQuota(uid, setChatQuota);
    // auth UID and owner identity are the only subscription inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, hasGoogleToken]);

  const quotaMessage = (key: 'chat.quotaExhausted' | 'chat.quotaUnavailable', resetAtMs?: number | null) => {
    let message = t(key).replace('{limit}', '55');
    if (resetAtMs) message = message.replace('{time}', new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(resetAtMs));
    return message;
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
    clearAllChatStates();
    setHasGoogleToken(false);
    setShowLogoutConfirm(false);
    // Back to the main intro page with a fresh chat
    setMessages([]);
    setInput('');
    setReplyTo(null);
    setEntry(exitToIntro());
    navigate('/');
  };

  // ===== 4. Account deletion (password re-auth, then wipe everything).
  // Account deletion as one staged machine (see accountDeletion.ts):
  // every failure lands in the same legal state - dialog open, not busy,
  // error shown.
  const [deletion, setDeletion] = useState<AccountDeletionState>(initialAccountDeletion);

  /**
   * Delete the account after password re-authentication: user doc, RTDB
   * traces, then the Auth user itself, then every local trace and a reset
   * to the intro screen.
   */
  const handleDeleteAccount = async () => {
    setDeletion(clearDeletionError);
    const current = auth.currentUser;
    if (!current || !current.email) {
      setDeletion(s => rejectDeletion(s, t('account.errNoUser')));
      return;
    }
    if (!deletion.password) {
      setDeletion(s => rejectDeletion(s, t('account.errNeedPassword')));
      return;
    }
    setDeletion(beginReauth);
    try {
      const cred = EmailAuthProvider.credential(current.email, deletion.password);
      await reauthenticateWithCredential(current, cred);
    } catch {
      setDeletion(s => failDeletion(s, t('account.errWrongPassword')));
      return;
    }
    const uid = current.uid;
    setDeletion(beginRemovingData);
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (e) {
      setDeletion(s => failDeletion(s, t('account.errDeleteDocFailed')));
      return;
    }
    // RTDB cleanup must happen BEFORE deleteUser signs us out: afterwards
    // there is no auth left and the server denies these writes, leaving
    // stale session/stats entries behind.
    try {
      await rtdbRemove(rtdbRef(rtdb, `referee/sessions/${uid}`));
    } catch { /* session may not exist */ }
    await removeRefereeUser(uid);
    setDeletion(beginDeletingAuth);
    try {
      await deleteUser(current);
    } catch {
      setDeletion(s => failDeletion(s, t('account.errDeleteFailed')));
      return;
    }
    try { await logout(); } catch { /* ignore */ }
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('user_picture');
    localStorage.removeItem('user_name');
    clearAllChatStates();
    setHasGoogleToken(false);
    setDeletion(completeDeletion());
    setEntry(exitToIntro());
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
    clearAllChatStates();
    setHasGoogleToken(false);
    setSessionKicked(true);
  };
  // ===== 5. Chat state: messages, input, rulebook files, request flags.
  const [seasonName, setSeasonName] = useState<string>('UNKNOWN');
  const seasonIdentity = useSeasonIdentity(seasonName);
  // Every page load starts a clean conversation: chat history is NOT
  // restored after a refresh (owner decision). Anything persisted by older
  // versions is wiped on mount below; sign-out/kick/delete still wipe via
  // localHistory.ts.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // WhatsApp-style reply: quoted answer context for a follow-up question.
  const [replyTo, setReplyTo] = useState<{ text: string } | null>(null);
  // Attached user photos (max 3, images only, sent full-resolution).
  // Preview URLs stay alive for the session so sent bubbles keep showing them.
  const [attachedImages, setAttachedImages] = useState<{ file: File; url: string }[]>([]);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setActiveRulebookFiles] = useState<RulebookFile[]>([]);
  const rulebookLoadBarrierRef = useRef(createRulebookLoadBarrier<RulebookFile[]>([]));
  const rulebookMutationRef = useRef<Promise<void> | null>(null);
  const seasonNameRef = useRef(seasonName);
  seasonNameRef.current = seasonName;

  // True only while a rulebook load/upload is actually running - never a
  // fake "learning" delay.
  const [rulebookLoading, setRulebookLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // One request lifecycle state machine replaces the old sending /
  // requestFinished / stopHandled boolean trio (see requestMachine.ts).
  const requestRef = useRef<RequestMachine>(initialRequestMachine);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Grow the composer with its content (up to 5 lines), shrink back on send.
  const autoresizeComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  };
  useEffect(() => { autoresizeComposer(); }, [input]);

  // Wipe any chat history persisted by older versions on first mount, so a
  // refresh can never resurrect a past conversation.
  useEffect(() => { clearChatState(resolveRefereeUid() || 'anon'); }, []);

  useEffect(() => {
    const originalTitle = document.title;
    let originalFavicon = '';
    const faviconElement = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    
    if (faviconElement) {
      originalFavicon = faviconElement.href;
      // Change to the Virtual Referee logo
      faviconElement.href = "/favicon-192.png?v=3";
    }
    
    document.title = `${t('app.title')} | Boeing727`;

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
    setUploadError(null);
    setShowUploadModal(true);
  };

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: !reduce && distance < scroller.clientHeight * 1.25 ? 'smooth' : 'auto',
    });
  }, [messages, loading]);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
  }, []);

  const finishRenderedResponse = React.useCallback(() => {
    requestRef.current = finishRender(requestRef.current);
    abortControllerRef.current = null;
  }, []);
  const typewriter = useTypewriter({
    ready: typewriterReady,
    chatStarted,
    loading,
    onFinished: finishRenderedResponse,
  });
  const typewriterTargetRef = typewriter.targetRef;
  const typewriterCount = typewriter.count;
  const renderingResponse = typewriter.rendering;
  const setRenderingResponse = typewriter.setRendering;
  const isAiBusy = loading || renderingResponse;

  // A new deployment reloads the page only when nothing is streaming,
  // rendering, or typed - never mid-answer or mid-draft.
  useVersionCheck({ busy: isAiBusy, composerEmpty: !input.trim() });

  useEffect(() => {
    // Rulebook metadata is not needed on the landing screen. Waiting until
    // chat opens avoids downloading the R2 administration SDK on first paint.
    if (!chatStarted) return;
    const unsubSettings = onSnapshot(doc(db, 'app_config', 'rulebook'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.current_season && data.current_season !== seasonName) {
          seasonNameRef.current = data.current_season;
          setSeasonName(data.current_season);
        }
        void loadLatestRulebook().catch(() => {});
      } else {
        void loadLatestRulebook().catch(() => {});
      }
    });

    return () => unsubSettings();
  }, [chatStarted, seasonName]);

  /**
   * Load every rulebook source for the active season and detect the season
   * from their filenames, syncing it back to the shared config when it changes.
   */
  const fetchLatestRulebook = async () => {
    setRulebookLoading(true);
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
        throw apiErr;
      }

      if (files.length > 0) {
        // Include every source that belongs to the currently displayed active
        // season. Never truncate by upload recency: omitting the sixth file is
        // indistinguishable from a complete rulebook to the model.
        const loadedFiles = selectActiveRulebookSources(files, seasonNameRef.current, getPublicUrl);
        
        setActiveRulebookFiles(loadedFiles);

        const detectedSeason = loadedFiles.reduce((season, f) => {
          const extracted = extractSeasonFromFilename(f.name);
          return extracted !== 'UNKNOWN' ? extracted : season;
        }, 'UNKNOWN');

        if (detectedSeason !== 'UNKNOWN') {
          if (detectedSeason !== seasonNameRef.current) {
            seasonNameRef.current = detectedSeason;
            setSeasonName(detectedSeason);
            try {
              await updateDoc(doc(db, 'app_config', 'rulebook'), {
                current_season: detectedSeason,
                last_updated: Date.now()
              });
            } catch (e) {}
            // One-time identity generation for seasons that predate the
            // upload-time hook; no-op when the identity already exists.
            void (async () => {
              try {
                const [{ listRulebookImagePages }, { fileToBase64 }] = await Promise.all([
                  import('../lib/r2'),
                  import('../features/referee/rulebook/pdfRendering'),
                ]);
                let evidence;
                const cover = loadedFiles[0];
                if (cover) {
                  const pages = await listRulebookImagePages(cover.name);
                  if (pages.length) {
                    const blob = await fetch(getPublicUrl(`fll-rules-images/${cover.name}/page_${pages[0]}.jpg`)).then(r => r.ok ? r.blob() : Promise.reject(new Error(String(r.status))));
                    evidence = { imageBase64: await fileToBase64(blob), mimeType: 'image/jpeg' };
                  }
                }
                await ensureSeasonIdentity(detectedSeason, evidence);
              } catch { /* identity is best-effort */ }
            })();
          }
        } else if (seasonNameRef.current !== 'UNKNOWN') {
          seasonNameRef.current = 'UNKNOWN';
          setSeasonName('UNKNOWN');
          try {
            await updateDoc(doc(db, 'app_config', 'rulebook'), {
              current_season: 'UNKNOWN',
              last_updated: Date.now()
            });
          } catch (e) {}
        }
        setRulebookLoading(false);
        return loadedFiles;
      } else {
        setActiveRulebookFiles([]);
        setRulebookLoading(false);
        return [];
      }
    } catch (err) {
      console.error("Failed to fetch rulebook:", err);
      setRulebookLoading(false);
      throw err;
    }
  };

  const loadLatestRulebook = () => rulebookLoadBarrierRef.current.load(fetchLatestRulebook);
  const refreshLatestRulebook = () => rulebookLoadBarrierRef.current.refresh(fetchLatestRulebook);


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
  const uploadingRef = useRef(false);

  const performUpload = async (file: File) => {
    // Synchronous single-flight: rapid double taps on the season-wipe
    // confirm could otherwise start two uploads of the same file.
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setUploadProgress(0);
    setRulebookLoading(true);
    let resolveMutation!: () => void;
    let rejectMutation!: (reason?: unknown) => void;
    const mutation = new Promise<void>((resolve, reject) => {
      resolveMutation = resolve;
      rejectMutation = reject;
    });
    rulebookMutationRef.current = mutation;
    void mutation.catch(() => {});
    try {
      const [{ Upload }, { s3Client, R2_BUCKET_NAME, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand }, { convertPdfToImages, fileToBase64 }] = await Promise.all([
        import('@aws-sdk/lib-storage'),
        import('../lib/r2'),
        import('../features/referee/rulebook/pdfRendering'),
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

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const images = await convertPdfToImages
          if (isNewSeason && images.length > 0) {
            // The season's cover is the strongest branding evidence: generate
            // and persist its badge identity once, right after upload.
            void ensureSeasonIdentity(extractedSeason, { imageBase64: await fileToBase64(images[0].data), mimeType: 'image/jpeg' }).catch(() => {});
          }(new Blob([await file.arrayBuffer()], { type: 'application/pdf' }));
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

      setRulebookLoading(true);
      await refreshLatestRulebook();
      setRulebookLoading(false);
      setUploading(false);
      uploadingRef.current = false;
      setUploadProgress(0);
      resolveMutation();
      if (rulebookMutationRef.current === mutation) rulebookMutationRef.current = null;
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

    } catch (error: any) {
      console.error('Upload error:', error);
      // The dialog stays open with a clean inline error - no blocking
      // alert, no raw technical message.
      setUploadError('העלאת הקובץ נכשלה. בדוק חיבור ונסו שוב.');
      setUploading(false);
      uploadingRef.current = false;
      setUploadProgress(0);
      setRulebookLoading(false);
      rejectMutation(error);
      if (rulebookMutationRef.current === mutation) rulebookMutationRef.current = null;
    }
  };


  /**
   * Gemini-style Stop: abort the provider stream immediately, freeze the
   * typewriter on everything already received, and keep the partial answer
   * as the final message — copyable, replyable and history-safe. An answer
   * that never started leaves no bubble. Idempotent across rapid clicks and
   * the late resolution of the aborted request.
   */
  const handleStop = () => {
    const stop = applyStop(requestRef.current);
    if (!stop.tookEffect) return;
    requestRef.current = stop.next;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    typewriter.finish();
    refundClientRateLimit();
    setMessages(applyStopToMessages);
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
   * popup. Stop via handleStop: the partial answer stays and the client rate-limit slot is refunded.
   */
  /**
   * Hybrid optimistic send: the user's bubble echoes instantly, then the
   * preflight guards (rulebook barrier, blind-answer guard, client rate
   * limit, server daily quota) run. If a guard rejects, the optimistic
   * bubble is removed and the exact draft, reply context and attachments
   * are restored without loss or flicker; the guard's notice appears as a
   * model bubble. A synchronous single-flight ref blocks double submits
   * through stale closures. On success the request streams as before;
   * Stop keeps the partial answer and refunds the client rate-limit slot.
   */
  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;

    if ((!textToSend.trim() && !attachedImages.length) || isAiBusy) return;
    // State-machine single-flight: only an idle lifecycle accepts a send,
    // so rapid double taps can never slip through a stale render closure.
    const begin = beginSend(requestRef.current);
    if (!begin.started) return;
    requestRef.current = begin.next;
    const sendRequestId = begin.next.requestId;

    const userMessage = textToSend.trim();
    // Snapshot everything the optimistic echo consumes, so a rejected
    // send restores the exact composer state with no loss.
    const replySnapshot = replyTo;
    const photosToSend = attachedImages;

    // WhatsApp-style reply: quoted answer travels as prompt context and as
    // a visible quote on the sent bubble.
    const replyContext = replySnapshot
      ? `(הקשר: המשתמש ממשיך ושואל שאלת המשך על התשובה הקודמת הבאה: "${replySnapshot.text.slice(0, 800)}")\n\n`
      : null;
    const replyQuote = replySnapshot ? replySnapshot.text.slice(0, 220) : undefined;

    // Optimistic echo: bubble first, guards after.
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

    /** Undo the echo and hand the composer its exact prior state back. */
    const rollback = () => {
      setMessages(prev => {
        const idx = prev.reduce((found, m, i) => (m.role === 'user' && m.text === userMessage ? i : found), -1);
        if (idx < 0) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setInput(userMessage);
      setReplyTo(replySnapshot);
      setAttachedImages(photosToSend);
    };

    /** Roll the echo back and leave the guard's notice as a model bubble. */
    const rejectWithNotice = (notice: string) => {
      rollback();
      setMessages(prev => [...prev, { role: 'model', text: notice }]);
    };

    try {
      let requestRulebookFiles: RulebookFile[];
      try {
        if (rulebookMutationRef.current) await rulebookMutationRef.current;
        requestRulebookFiles = await rulebookLoadBarrierRef.current.ready();
      } catch {
        rejectWithNotice(t('chat.guardRulebookLoadFailed'));
        return;
      }

      // Guard chain (pure decisions; order test-locked in sendGuards.ts):
      // blind-answer guard -> client rate limit -> server daily quota.
      // The quota unit is consumed only when the cheaper guards passed.
      const clientLimit = consumeClientRateLimit();
      let quotaError: { exhausted: boolean; resetAtMs?: number | null } | null = null;
      const quotaUid = resolveRefereeUid();
      if (quotaUid && requestRulebookFiles.length > 0 && clientLimit.allowed) {
        try {
          // Server-enforced daily budget: consumes one unit from
          // chat_quota/{uid}. Rules enforce strictly-+1 inside a rolling
          // 24h window with a hard cap, so clearing localStorage or
          // switching devices cannot dodge it.
          await consumeChatQuota(quotaUid);
        } catch (error) {
          quotaError = error instanceof ChatQuotaExhaustedError
            ? { exhausted: true, resetAtMs: error.resetAtMs }
            : { exhausted: false };
        }
      }
      const guard = decideSendPreflight(
        { rulebookCount: requestRulebookFiles.length, clientLimit, quotaError },
        {
          rulebookLoadFailed: t('chat.guardRulebookLoadFailed'),
          noRulebook: t('chat.guardNoRulebook'),
        cooldown: t('chat.guardCooldown'),
        hourlyLimit: t('chat.guardHourlyLimit'),
          genericRateLimited: t('chat.guardRateLimited'),
          quotaExhausted: quotaMessage('chat.quotaExhausted', quotaError?.resetAtMs),
          quotaUnavailable: quotaMessage('chat.quotaUnavailable'),
        });
      if (guard.kind === 'reject') {
        rejectWithNotice(guard.notice);
        return;
      }

      requestRef.current = beginStream(requestRef.current);
      setLoading(true);
      resetThinkCycle();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setRenderingResponse(false);
      try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch(e) {}

      try {
        const finalPrompt = (replyContext || '') + userMessage + "\n\n(הנחיה לשופט: אם השאלה עוסקת במשימה חדשה או מצב חדש - התעלם מהמשימה שנדונה קודם לכן ואל תערבב בין חוקים או ניקודים של משימות שונות.)";

        const { GeminiService } = await import('../services/geminiService');
        const response = await GeminiService.askRulebook(
          finalPrompt,
          messages,
          requestRulebookFiles,
          seasonNameRef.current,
          photosToSend.map(a => ({ url: '' as string, key: a.file.name, actualFile: a.file })),
          (chunkText) => {
            if (controller.signal.aborted) return;
            if (requestRef.current.requestId !== sendRequestId) return;
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
          const outcome = resolveResponseOutcome(response, t('chat.commError'));
          if (!isCurrentUserOwner() && outcome.answered) {
            trackQuestion(resolveRefereeUid() || 'anon');
          }
          logRefereeQA({
            question: userMessage,
            answer: outcome.logAnswer,
            season: seasonName,
            language,
            uid: resolveRefereeUid(),
            model: 'gemini-3.6-flash',
            ok: outcome.answered,
          });
          requestRef.current = completeStream(requestRef.current);
          setRenderingResponse(true);
          setMessages(prev => finalizeModelResponse(prev, response, t('chat.commError')));
          if (outcome.answered) maybePromptFeedback();
        }
      } catch (error: any) {
        if (controller.signal.aborted) {
          handleStop();
        } else {
          const errMsg = safeUserFacingError(error, t('chat.connectionLost'));
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
        if (requestRef.current.phase !== 'rendering') abortControllerRef.current = null;
        requestRef.current = settle(requestRef.current);
        setLoading(false);
        if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
      }
    } finally {
      requestRef.current = settle(requestRef.current);
    }
  };


  const quickQuestions = [
    t('chat.suggestion1'),
    t('chat.suggestion2'),
    t('chat.suggestion3'),
    t('chat.suggestion4')
  ];
  const heroActive = chatStarted && messages.length === 0 && !loading;





  return (
    <motion.div
      initial={false}
      className="h-screen h-[100dvh] w-full flex flex-col bg-slate-950 overflow-hidden relative font-sans" dir={isRTL ? 'rtl' : 'ltr'}
    >
      <MotionConfig reducedMotion="user" transition={MOTION.content}>
      <motion.div aria-hidden initial={{ opacity: 0, scale: 1.025 }} animate={{ opacity: 1, scale: 1 }} transition={MOTION.filmReveal} className="absolute inset-0"><ChatBackdrop tint={seasonIdentity?.via} /></motion.div>

      {/* Header - Liquid Glass bar */}
      <motion.div initial={{ opacity: 0, y: -18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.08 }} className="mx-2.5 mt-2.5 md:mx-4 md:mt-3.5 rounded-[16px] border border-white/[0.13] bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05),0_16px_44px_rgba(0,0,0,0.45)] z-30 shrink-0 relative">
        {/* Row 1: Logo + Title + User */}
        <div className="px-3 py-2 md:px-4 md:py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 md:gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full shrink-0 overflow-hidden ring-1 ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_14px_rgba(0,0,0,0.35)]">
              <img src="/logoref.png" alt={t('app.title')} className="w-full h-full object-contain select-none" />
            </div>
            <h1 className="min-w-0 truncate text-base md:text-xl font-bold text-white/95 tracking-tight cursor-default select-none leading-tight">
              {t('app.title')}
            </h1>
            <div className="flex md:hidden items-center shrink-0">
              <SeasonStatus learning={rulebookLoading} season={seasonName} label={t('chat.updating')} compact identity={seasonIdentity} />
            </div>
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center min-w-0 px-4">
            <SeasonStatus learning={rulebookLoading} season={seasonName} label={t('chat.updating')} identity={seasonIdentity} />
          </div>

          <div className="flex items-center gap-1 md:gap-3">
            {sessionAlive && displayUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="flex items-center gap-2 p-1 pe-2 md:pe-2.5 rounded-[12px] border border-white/[0.16] bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-white/[0.14] hover:border-white/[0.26] transition-colors cursor-pointer"
                >
                  <div className="hidden sm:flex items-center ps-1.5">
                    <span className="text-xs font-bold text-white/85 max-w-[120px] truncate leading-none">{displayUser.name}</span>
                  </div>
                  {displayUser.picture || gravatarPic ? (
                    <img
                      src={displayUser.picture || gravatarPic}
                      alt=""
                      className="w-7 h-7 md:w-8 md:h-8 rounded-full ring-1 ring-white/25 object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full ring-1 ring-white/20 bg-white/10 flex items-center justify-center">
                      <span className="text-xs md:text-sm font-bold text-white/85">
                        {(displayUser.name || 'U').trim().charAt(0)}
                      </span>
                    </div>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-white/45 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={MOTION.overlay}
                      className="absolute top-full mt-2 left-0 sm:right-0 sm:left-auto w-64 bg-[#0c1322]/80 backdrop-blur-2xl backdrop-saturate-150 rounded-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_50px_rgba(0,0,0,0.55)] border border-white/[0.12] overflow-hidden z-50"
                    >
                      <div className="p-3 bg-white/[0.03] border-b border-white/[0.08] flex items-center gap-3">
                        {displayUser.picture || gravatarPic ? (
                          <img src={displayUser.picture || gravatarPic} alt="" className="w-10 h-10 rounded-full border-2 border-slate-950 object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full border border-white/15 bg-white/10 flex items-center justify-center">
                            <span className="text-sm font-black text-white/80">{(displayUser.name || 'U').trim().charAt(0)}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0 text-start">
                          <p className="text-sm font-black text-white truncate">{displayUser.name}</p>
                          <p className="text-xs text-white/45 truncate" dir="ltr">
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
                          <LogOut className="w-4 h-4 text-white/40" />
                          {t('auth.logout')}
                        </button>
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setDeletion(openDeletionConfirm());
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] text-white/70 hover:text-[#ff7a66] font-bold text-sm transition-colors text-start cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-[#ff7a66]/70" />
                          {t('common.deleteAccount')}
                        </button>
                        <div className="h-px bg-white/[0.08] my-1" />
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowPrivacy(true);
                          }}
                          className={MENU_ROW_CLASS}
                        >
                          <Shield className="w-4 h-4 text-white/40" />
                          {t('common.privacy')}
                        </button>
                        {isCurrentUserOwner() && (
                          <button
                            onClick={() => { setShowUserMenu(false); setShowSettings(true); }}
                            className={MENU_ROW_CLASS}
                          >
                            <Settings className="w-4 h-4 text-white/40" />
                            {t('common.settings')}
                          </button>
                        )}
                        {auth.currentUser && !auth.currentUser.emailVerified && isCurrentUserOwner() && (
                          <button
                            onClick={async () => {
                              setShowUserMenu(false);
                              try {
                                const { sendEmailVerification } = await import('firebase/auth');
                                const fbUser = auth.currentUser;
                                if (fbUser) {
                                  await sendEmailVerification(fbUser);
                                  showToast(t('common.ownerVerificationSent'));
                                }
                              } catch {
                                showToast(t('common.ownerVerificationFailed'));
                              }
                            }}
                            className={MENU_ROW_CLASS}
                          >
                            <MailCheck className="w-4 h-4 text-amber-400/80" />
                            <span className="flex-1">{t('common.sendOwnerVerification')}</span>
                          </button>
                        )}
                        <div className="h-px bg-white/[0.08] my-1" />
                        <button
                          onClick={() => { setShowUserMenu(false); setShowRefereeLogs(true); }}
                          className={MENU_ROW_CLASS}
                        >
                          <ScrollText className="w-4 h-4 text-white/40" />
                          {t('common.refereeLogs')}
                        </button>
                        <div className="h-px bg-white/[0.08] my-1" />
                        <button
                          ref={langBtnRef}
                          onClick={openLangMenu}
                          className={MENU_ROW_CLASS}
                        >
                          <Globe className="w-4 h-4 text-white/40" />
                          <span className="flex-1">{t('common.language')}</span>
                          <span className="text-[11px] text-white/40 font-bold">{languages.find(l => l.code === language)?.native}</span>
                          <ChevronLeft className="w-4 h-4 text-white/30" />
                        </button>
                      </div>
                      <div className="px-3 py-2 bg-white/[0.03] border-t border-white/[0.08] text-center">
                        <span className="text-[10px] font-bold text-white/35">{t('common.creditBuiltBy')} · {t('common.version')} {
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
                className="text-sm font-bold text-white/90 tracking-tight rounded-full border border-white/[0.13] bg-white/[0.07] backdrop-blur-xl px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white/[0.11] transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>{sessionAlive ? t('auth.logout') : t('auth.login')}</span>
              </button>
            )}
            <div className="hidden md:inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 select-none">
              <span className="inline-flex items-center rounded-md bg-black/25 backdrop-blur-sm px-1.5 py-0.5 ring-1 ring-white/10"><img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3 w-auto object-contain opacity-95" /></span>
              <span className="text-[10px] font-semibold text-white tracking-wide [text-shadow:0_1px_8px_rgba(0,0,0,0.75)]">Boeing <span className="text-red-300">727</span> <span className="text-white/60">&</span> Yuval Margalit</span>
            </div>

          </div>
        </div>
      </motion.div>

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
      <motion.div initial={{ opacity: 0, scale: 0.997 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...MOTION.filmReveal, delay: 0.18 }} className="flex-1 min-h-0 overflow-y-auto scroll-smooth relative z-10" ref={scrollRef}>
        <div className="w-full max-w-3xl lg:max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5 lg:py-4 space-y-4 md:space-y-5">
        <AnimatePresence>{heroActive && <ChatHero
          greeting={heroGreeting}
          questions={quickQuestions}
          disabled={isAiBusy || rulebookLoading}
          onQuestion={question => handleSend(question)}
          t={t}
        />}</AnimatePresence>
        <AnimatePresence initial={false} mode="popLayout">
        {messages.map((message, index) => {
          const preview = buildMessageView(message, index, {
            lastIndex: messages.length - 1,
            loading,
            typewriterReady,
            typewriterCount,
            typewriterTarget: typewriterTargetRef.current,
            chatStarted,
            stopped: requestRef.current.stopHandled,
          });
          if (index === messages.length - 1 && message.role === 'model' && preview.fullText && typewriterReady) {
            typewriterTargetRef.current = typewriterLength(preview.fullText);
          }
          return <ChatMessageRow
            key={index}
            view={buildMessageView(message, index, {
              lastIndex: messages.length - 1,
              loading,
              typewriterReady,
              typewriterCount,
              typewriterTarget: typewriterTargetRef.current,
              chatStarted,
              stopped: requestRef.current.stopHandled,
            })}
            userPicture={user?.picture || displayUser?.picture || gravatarPic || localStorage.getItem('user_picture') || ''}
            userName={displayUser?.name || 'U'}
            onCopy={async text => { if (await copyText(text)) showToast(t('chat.copied')); }}
            onReply={text => { setReplyTo({ text: text.slice(0, 800) }); composerRef.current?.focus(); }}
            t={t}
          />;
        })}
        </AnimatePresence>
        
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5 md:gap-3">
            <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full bg-white ring-1 ring-white/25 overflow-hidden flex items-center justify-center">
              <img src="/logoref.png" alt="" className="w-6 h-6 md:w-7 md:h-7 object-contain" />
            </div>
            <div className="bg-[#04060c]/55 border border-white/[0.12] backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_24px_rgba(0,0,0,0.35)] px-4 py-3 rounded-full flex items-center">
              <ThinkIndicator />
            </div>
          </motion.div>
        )}
        </div>
      </motion.div>

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
        learning={rulebookLoading}
        onSend={() => handleSend()}
        onStop={handleStop}
        t={t}
        quotaText={chatQuota ? t('chat.quotaRemaining').replace('{remaining}', String(chatQuota.remaining)).replace('{limit}', String(chatQuota.limit)) : null}
      />

      {/* ===== Floating layers: every modal/toast/drawer mounts here and
          gates itself with isOpen, so the chat tree underneath never unmounts. ===== */}

      <RulebookUploadDialog
        open={showUploadModal}
        uploading={uploading}
        progress={uploadProgress}
        error={uploadError}
        inputRef={fileInputRef}
        onFile={handleFileUpload}
        onClose={() => setShowUploadModal(false)}
        t={t}
      />
      <SeasonWipeDialog
        pending={wipePending}
        typed={wipeTyped}
        setTyped={setWipeTyped}
        onCancel={() => { setWipePending(null); setWipeTyped(''); }}
        onConfirm={confirmSeasonWipe}
      />

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
      {entryBurst && <ParticleBurst onDone={() => setEntryBurst(false)} />}
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
          <div className="fixed inset-x-0 bottom-24 md:bottom-28 z-[80] flex justify-center pointer-events-none px-4" dir={isRTL ? 'rtl' : 'ltr'}>
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={MOTION.content}
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

      <DeleteAccountDialog
        open={isDeletionDialogOpen(deletion)}
        password={deletion.password}
        error={deletion.error}
        deleting={isDeleting(deletion)}
        setPassword={(pw: string) => setDeletion(s => setDeletionPassword(s, pw))}
        clearError={() => setDeletion(clearDeletionError)}
        onCancel={() => setDeletion(cancelDeletion)}
        onConfirm={handleDeleteAccount}
      />

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

      <SessionKickedDialog
        open={sessionKicked}
        onReturnToLogin={() => { setSessionKicked(false); navigate('/login'); }}
      />

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
              transition={MOTION.overlay}
              style={{ top: langPos.top, right: langPos.right }}
              className="fixed z-[70] w-52 max-w-[70vw] bg-[#0a121e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden"
              dir={isRTL ? 'rtl' : 'ltr'}
              role="dialog"
              aria-label={t('common.language')}
            >
              <div className="py-1 divide-y divide-white/[0.07] max-h-[50vh] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
                {languages.map((lang) => {
                  const active = language === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => { setLanguage(lang.code); setShowLangMenu(false); setShowUserMenu(false); }}
                      className="relative w-full px-4 py-3 text-white/70 hover:text-white font-bold text-sm text-center hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      {lang.native}
                      {active && (
                        <span className="absolute bottom-2 right-4 left-4 h-[2px] rounded-full bg-yellow-400/70" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </MotionConfig>
    </motion.div>
  );
}
