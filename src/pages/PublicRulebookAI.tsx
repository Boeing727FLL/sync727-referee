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
import { Suspense, useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Wrench, Check } from 'lucide-react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase/firestore';
import { getPublicUrl } from '../lib/r2Config';
import { gravatarUrlForEmail, probeImage } from '../lib/avatar';
import { ensureSeasonIdentity, useSeasonIdentity } from '../features/referee/season/identity';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import ConfirmationModal from '../features/referee/ui/ConfirmationModal';
import IntroScreen from '../features/referee/ui/IntroScreen';
import MandatoryDisclaimerModal from '../features/referee/ui/MandatoryDisclaimerModal';
import TermsGateModal from '../features/referee/ui/TermsGate';
import { acceptedLocally, acceptedOnServer, recordAcceptance } from '../legal/termsAcceptance';
import ParticleBurst from '../features/referee/ui/ParticleBurst';
import { isCurrentUserOwner } from '../lib/owner';
import { subscribeChatQuota, type ChatQuotaStatus } from '../lib/chatQuota';
import type { RefereeDisplayUser, RulebookFile } from '../features/referee/types';
import { DAY_MS, ENTER_FLASH_MS, FEEDBACK_PROMPT_DELAY_MS, FEEDBACK_QUIET_AFTER_SUBMIT_DAYS, FEEDBACK_REPROMPT_DAYS } from '../features/referee/config';
import {
  cancelDeletion,
  clearDeletionError,
  isDeleting,
  isDeletionDialogOpen,
  openDeletionConfirm,
  setDeletionPassword,
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
import { extractSeasonFromFilename } from '../features/referee/rulebook/season';
import { createRulebookLoadBarrier } from '../features/referee/rulebook/loadBarrier';
import useRulebookUpload from '../features/referee/rulebook/useRulebookUpload';
import { selectActiveRulebookSources } from '../features/referee/rulebook/activeFiles';
import { clearRefereeSessionStorage, hasSavedRefereeSession } from '../features/referee/session/storage';
import { useVersionCheck } from '../features/referee/ui/useVersionCheck';
import { useTransientToast } from '../features/referee/ui/useTransientToast';
import useOverlays from '../features/referee/ui/useOverlays';
import useAccountDeletion from '../features/referee/session/useAccountDeletion';
import { copyText } from '../features/referee/ui/browser';
import { buildMessageView, typewriterLength } from '../features/referee/chat/messageView';
import useChatConversation from '../features/referee/chat/useChatConversation';
import ChatMessageRow, { ThinkingCard } from '../features/referee/chat/ChatMessageRow';
import { SeasonStatus } from '../features/referee/ui/RefereeBackdrop';
import { MOTION } from '../features/referee/ui/motion';
import { DeleteAccountDialog, SessionKickedDialog } from '../features/referee/ui/AccountDialogs';
import ChatComposer from '../features/referee/chat/ChatComposer';
import ChatAttachmentTray from '../features/referee/chat/ChatAttachmentTray';
import { ReplyGlyph } from '../features/v12/glyphs';
import { extractFollowUps } from '../features/referee/chat/text';
import ChatHero from '../features/referee/chat/ChatHero';
import UserMenu from '../features/referee/ui/UserMenu';
import { RulebookUploadDialog, SeasonWipeDialog } from '../features/referee/rulebook/RulebookDialogs';

import { AdminAnalyticsModal, FeedbackAdminModal, FeedbackModal, JudgeCorrectionsModal, MaintenanceScreen, PrivacyModal, RefereeLogsModal, SettingsModal } from '../features/referee/ui/lazyComponents';

import { startPresence, trackRefereeUser, getDeviceId, registerSession, watchSession } from '../lib/analytics';
import { subscribeFeedbackReset, setMaintenance } from '../lib/refereeFlags';
import { signOut, onAuthStateChanged } from 'firebase/auth';
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

  const displayUser = useMemo<RefereeDisplayUser | null>(() => {
    if (user) return user;
    try {
      const fb = auth.currentUser;
      if (fb?.email || fb?.displayName) {
        return {
          name: fb.displayName || fb.email?.split('@')[0] || 'משתמש',
          picture: fb.photoURL || '',
          email: fb.email || '',
        };
      }
      const raw = localStorage.getItem('auth_user');
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.email || p?.name) {
          return {
            name: p.name || p.email?.split('@')[0] || 'משתמש',
            picture: p.picture || '',
            email: p.email || '',
          };
        }
      }
      const pic = localStorage.getItem('user_picture');
      const nm = localStorage.getItem('user_name');
      if (pic || nm) {
        return { name: nm || 'משתמש', picture: pic || '', email: '' };
      }
    } catch {}
    return null;
  }, [user, hasGoogleToken]);
  // Personal time-of-day greeting for the hero. Shown only with a real
  // name — generic fallbacks ('משתמש', email fragments) stay silent.
  const heroGreeting = useMemo(() => {
    const raw = displayUser?.name || '';
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
  const {
    showPrivacy, setShowPrivacy,
    showTerms, setShowTerms,
    showSettings, setShowSettings,
    showSettingsFeedback, setShowSettingsFeedback,
    maintenance,
    showLogoutConfirm, setShowLogoutConfirm,
    showAdminAnalytics, setShowAdminAnalytics,
    showRefereeLogs, setShowRefereeLogs,
    showJudgeCorrections, setShowJudgeCorrections,
    showFeedback, setShowFeedback,
  } = useOverlays();
  const [termsOk, setTermsOk] = useState<boolean>(() => acceptedLocally());
  useEffect(() => { if (!termsOk) void acceptedOnServer().then(ok => { if (ok) setTermsOk(true); }); }, [termsOk]);
  // In-site toast (replaces blocking alert popups).
  const { toast, showToast } = useTransientToast();

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
  // Dark settle veil: completes the login transition. Fades out over the
  // freshly mounted chat while the disclaimer descends above it - no flash.
  const [enterFlash, setEnterFlash] = useState<boolean>(() => entryStart === 'chat' ? false : autoEnter);
  useEffect(() => {
    if (!enterFlash) return;
    const t = setTimeout(() => setEnterFlash(false), ENTER_FLASH_MS);
    return () => clearTimeout(t);
  }, [enterFlash]);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Persist the Firebase-restored profile photo: the chat bubbles read
  // localStorage, which doesn't roam across devices — without this sync a
  // Google photo visible in the user menu never reaches the bubbles on a
  // fresh device.
  useEffect(() => {
    try {
      const pic = displayUser?.picture || '';
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
      if (displayUser?.picture || localStorage.getItem('user_picture') || gravatarPic) return;
      const email = displayUser?.email || '';
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
  // The staged machine and its handler live in useAccountDeletion; after a
  // successful wipe the caller resets the screen back to the intro.
  const { deletion, setDeletion, handleDeleteAccount } = useAccountDeletion({
    t,
    onDeleted: () => {
      clearAllChatStates();
      setHasGoogleToken(false);
      setEntry(exitToIntro());
      navigate('/');
    },
  });

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
  const [, setActiveRulebookFiles] = useState<RulebookFile[]>([]);
  const rulebookLoadBarrierRef = useRef(createRulebookLoadBarrier<RulebookFile[]>([]));
  const rulebookMutationRef = useRef<Promise<void> | null>(null);
  const seasonNameRef = useRef(seasonName);
  seasonNameRef.current = seasonName;

  // True only while a rulebook load/upload is actually running - never a
  // fake "learning" delay.
  const [rulebookLoading, setRulebookLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The conversation engine (messages, streaming send/stop, typewriter)
  // lives in useChatConversation; everything the render tree reads comes
  // back from it.
  const {
    messages, setMessages,
    input, setInput,
    replyTo, setReplyTo,
    attachedImages,
    attachInputRef,
    loading,
    isAiBusy,
    renderingResponse,
    typewriterCount,
    typewriterTargetRef,
    requestRef,
    handleSend, handleStop,
    handleAttachImages, removeAttachedImage,
  } = useChatConversation({
    t, language, seasonName, seasonNameRef,
    rulebookLoadBarrierRef, rulebookMutationRef,
    typewriterReady, chatStarted,
    resolveRefereeUid, quotaMessage, maybePromptFeedback,
    isCurrentUserOwner, displayUser, showToast,
  });
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


  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    // Empty chat shows the hero, not a conversation. The disclaimer's scroll
    // position carries into this scroller, so an explicit top reset keeps
    // the greeting from opening above the fold on short screens.
    if (messages.length === 0) {
      if (!loading && chatStarted) scroller.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: !reduce && distance < scroller.clientHeight * 1.25 ? 'smooth' : 'auto',
    });
  }, [messages, loading, chatStarted]);


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

  // Offline recovery: if the rulebook load died with the network (offline
  // boot, tunnel, captive portal), onSnapshot does not re-fire when
  // connectivity returns and every send would stay rejected until reload.
  // Retry once per 'online' event, only while the barrier is still empty.
  useEffect(() => {
    if (!chatStarted) return;
    const retryEmptyRulebook = () => {
      if (rulebookLoadBarrierRef.current.snapshot().length === 0) {
        void refreshLatestRulebook().catch(() => {});
      }
    };
    window.addEventListener('online', retryEmptyRulebook);
    return () => window.removeEventListener('online', retryEmptyRulebook);
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

  // Upload flow (modal state, season-wipe confirm, R2 upload + page-image
  // rendering) lives in useRulebookUpload; the dialog pieces come back as
  // props-ready values. Upload modal is for rulebook files only - judge
  // corrections live in the dedicated JudgeCorrectionsModal (Boeing badge).
  const {
    showUploadModal, setShowUploadModal, uploading, uploadProgress, uploadError,
    openUploadModal, handleFileUpload, confirmSeasonWipe,
    wipePending, setWipePending, wipeTyped, setWipeTyped, fileInputRef,
  } = useRulebookUpload({
    seasonName, t, setMessages, setRulebookLoading, rulebookMutationRef, refreshLatestRulebook,
  });


  const quickQuestions = [
    t('chat.suggestion1'),
    t('chat.suggestion2'),
    t('chat.suggestion3'),
    t('chat.suggestion4')
  ];
  const heroActive = chatStarted && messages.length === 0 && !loading;
  // Follow-up chips (v12 #9): Gemini suggests them inside the same answer
  // (a <followups> block, stripped from the visible text - no extra quota).
  // No block (old answer, failure text) means no chips - never canned ones.
  const lastMessage = messages[messages.length - 1];
  const askedTexts = new Set(messages.filter(m => m.role === 'user').map(m => (m.text || '').trim()));
  const followUps = (lastMessage?.role === 'model' ? extractFollowUps(lastMessage.text) : [])
    .filter(q => !askedTexts.has(q.trim()));
  const showFollowUps = chatStarted && !isAiBusy && !renderingResponse && followUps.length > 0
    && lastMessage?.role === 'model' && !!lastMessage.text && !lastMessage.isProgress && !lastMessage.stopped;





  return (
    <motion.div
      initial={false}
      className="v12-root h-screen-fix w-full flex flex-col bg-[#0A2A60] overflow-hidden relative font-sans app-shell-safe" dir={isRTL ? 'rtl' : 'ltr'}
    >
      <MotionConfig reducedMotion="user" transition={MOTION.content}>
      <div aria-hidden className="v12-chatbg"><div className="v12-bg" /><div className="v12-vig" /></div>

      {/* Header - v12 glass pill */}
      <motion.div initial={{ opacity: 0, y: -18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.08 }} className="v12-hdr">
        <div className="contents">
          <div className="v12-hdr-lg" role="img" aria-label={t('app.title')} />
          <div className="v12-hdr-t">
            <b>{t('app.title')}</b>
            <small className={isAiBusy || rulebookLoading ? 'v12-hdr-secondary-idle' : undefined}>
              {!isAiBusy && !rulebookLoading && <><i className="v12-dot" /><span>{t('v12.ready')}</span></>}
              <span className="shrink-0 v12-hdr-cr">{t('v12.from')} <span className="v12-b7">Boeing <i>727</i></span></span>
            </small>
          </div>
          <div className="shrink-0 flex items-center">
            <SeasonStatus learning={rulebookLoading} season={seasonName} label={t('chat.updating')} compact identity={seasonIdentity} />
          </div>
          <div className="flex items-center gap-1 md:gap-3">
            {sessionAlive && displayUser ? (
              <UserMenu
                displayUser={displayUser}
                gravatarPic={gravatarPic}
                isOwner={isCurrentUserOwner()}
                t={t}
                language={language}
                languages={languages}
                setLanguage={setLanguage}
                isRTL={isRTL}
                showToast={showToast}
                onLogout={() => setShowLogoutConfirm(true)}
                onDeleteAccount={() => setDeletion(openDeletionConfirm())}
                onPrivacy={() => setShowPrivacy(true)}
                onTerms={() => setShowTerms(true)}
                onSettings={() => setShowSettings(true)}
                onLogs={() => setShowRefereeLogs(true)}
              />
            ) : (
              <button
                onClick={sessionAlive ? () => setShowLogoutConfirm(true) : () => navigate('/login')}
                className="text-sm font-bold text-white/90 tracking-tight rounded-full border border-white/[0.13] bg-white/[0.07] backdrop-blur-xl px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-white/[0.11] transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>{sessionAlive ? t('auth.logout') : t('auth.login')}</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Dark settle veil after the login transition: the chat materializes
          out of the same deep navy the login dissolved into - no flash. */}
      {enterFlash && (
        <motion.div
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed inset-0 z-[9000] bg-[#020408]"
          aria-hidden
        />
      )}

      {/* Chat Area - premium AI console, full screen */}
      <motion.div initial={{ opacity: 0, scale: 0.997 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...MOTION.filmReveal, delay: 0.18 }} className="flex-1 min-h-0 overflow-y-auto no-scrollbar scroll-smooth relative z-10" ref={scrollRef} role="log" aria-live="polite">
        <div className="w-full max-w-3xl lg:max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-5 lg:py-4 space-y-4 md:space-y-5">
        <AnimatePresence>{heroActive && <ChatHero
          greeting={heroGreeting}
          compact={attachedImages.length > 0}
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
            onRate={() => showToast(t('v12.rated'))}
            seen={message.role === 'user' && index < messages.length - 1}
            latest={message.role === 'model' && index === messages.length - 1}
            t={t}
          />;
        })}
        </AnimatePresence>
        
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <ThinkingCard t={t} />
        )}
        {showFollowUps && (
          <div className="v12-fu" key={`fu-${messages.length}`}>
            <div className="v12-fu-lbl">{t('v12.followups')}</div>
            {followUps.map((question, i) => (
              <button key={question} type="button" className="v12-chip" style={{ animationDelay: `${0.35 + i * 0.12}s` }} onClick={() => handleSend(question)} disabled={isAiBusy || rulebookLoading}>
                <ReplyGlyph />{question}
              </button>
            ))}
          </div>
        )}
        </div>
      </motion.div>

      <ChatAttachmentTray attachments={attachedImages} removeAttachment={removeAttachedImage} t={t} />
      <ChatComposer
        replyTo={replyTo}
        clearReply={() => setReplyTo(null)}
        attachmentCount={attachedImages.length}
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
        quota={chatQuota ? { remaining: chatQuota.remaining, limit: chatQuota.limit } : null}
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

      <TermsGateModal isOpen={showDisclaimer && !termsOk} onAccept={() => { void recordAcceptance(); setTermsOk(true); }} />
      <MandatoryDisclaimerModal isOpen={showDisclaimer && termsOk} onConfirm={handleDisclaimerConfirm} t={t} />
      {entryBurst && <ParticleBurst onDone={() => setEntryBurst(false)} />}
      <Suspense fallback={null}>
      {showPrivacy && <PrivacyModal isOpen onClose={() => setShowPrivacy(false)} />}
      {showTerms && <PrivacyModal isOpen kind="terms" onClose={() => setShowTerms(false)} />}
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
      </MotionConfig>
    </motion.div>
  );
}
