/**
 * Live Referee call window (voice + camera judging over the Gemini Live API).
 *
 * WHAT: a phone-call-style modal. The referee talks back in voice, shows
 * live captions, and watches the table through the camera while the user
 * holds a mission up to it. Opened from the gold mic button in the chat.
 *
 * HOW IT WORKS: on open, a LiveRefereeSession is created (rulebook pages
 * load, socket connects, mic starts). Everything teardown-related lives
 * in the session; this component only mirrors session events into React
 * state and renders controls. Closing the modal always stops the session.
 *
 * DESIGN: FLL competition palette — deep navy surfaces, FIRST blue for the
 * user, gold accents for the referee, red reserved for stop/live states.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mic, MicOff, Camera, CameraOff, PhoneOff, Send, Loader2,
} from 'lucide-react';
// Type-only: the service (and the Google SDK it pulls) loads lazily when the
// live window actually opens, keeping the initial site bundle lean.
import type { LiveRefereeSession, LiveStatus, LiveTranscriptLine } from '../services/liveRefereeService';

// ---------------------------------------------------------------------------
// Props & static copy
// ---------------------------------------------------------------------------

interface LiveRefereeModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasonName: string;
  rulebookFiles: { name: string; url: string }[];
}

/** Hebrew label for each connection phase, shown in the header pill. */
const STATUS_LABEL: Record<LiveStatus, string> = {
  idle: 'מוכן',
  'loading-book': 'טוען חוברת...',
  connecting: 'מתחבר...',
  live: 'מחובר, מדברים',
  error: 'שגיאת חיבור',
};

/** How long a transient notice (camera hiccup, etc.) stays on screen. */
const NOTICE_MS = 3500;

const SPRING = { type: 'spring', stiffness: 300, damping: 28 } as const;

// ---------------------------------------------------------------------------
// Small presentational pieces (no hooks, no logic)
// ---------------------------------------------------------------------------

/** One round call button with its caption underneath (mic / hang up / camera). */
function RoundControl({ onClick, disabled, title, caption, active, pulse, danger, icon }: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  caption: string;
  active?: boolean;
  pulse?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
}) {
  const palette = danger
    ? 'bg-[#E1251B] hover:bg-[#C11E16] text-white shadow-[0_10px_30px_rgba(225,37,27,0.35)]'
    : active
      ? 'bg-[#0B6BCB] text-white shadow-[0_8px_26px_rgba(11,107,203,0.4)]'
      : 'bg-white/[0.06] border border-white/15 text-slate-300 hover:text-white hover:border-white/30';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {pulse && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-[#0B6BCB]/40"
            animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={title}
          title={title}
          className={`relative ${danger ? 'w-16 h-16' : 'w-14 h-14'} rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 active:scale-95 ${palette}`}
        >
          {icon}
        </button>
      </div>
      <span className="text-[10px] font-bold text-slate-500">{caption}</span>
    </div>
  );
}

/** The four viewfinder corners drawn over a live camera feed. */
function ViewfinderCorners() {
  const base = 'absolute w-6 h-6 border-[#FFC400]/90 pointer-events-none';
  return (
    <>
      <span className={`${base} top-3 left-3 border-t-[3px] border-l-[3px] rounded-tl-xl`} aria-hidden />
      <span className={`${base} top-3 right-3 border-t-[3px] border-r-[3px] rounded-tr-xl`} aria-hidden />
      <span className={`${base} bottom-3 left-3 border-b-[3px] border-l-[3px] rounded-bl-xl`} aria-hidden />
      <span className={`${base} bottom-3 right-3 border-b-[3px] border-r-[3px] rounded-br-xl`} aria-hidden />
    </>
  );
}

/** One transcript bubble; user lines are FIRST blue, referee lines neutral. */
function TranscriptBubble({ who, children }: { who: 'user' | 'model'; children: React.ReactNode }) {
  return (
    <div className={`flex ${who === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        who === 'user'
          ? 'bg-[#0B6BCB] text-white rounded-br-md'
          : 'bg-white/[0.05] border border-white/10 border-r-2 border-r-[#FFC400] text-slate-100 rounded-bl-md'
      }`}>
        <div className="whitespace-pre-wrap break-words">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

export default function LiveRefereeModal({ isOpen, onClose, seasonName, rulebookFiles }: LiveRefereeModalProps) {
  // -- connection & media state -------------------------------------------
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [bookPages, setBookPages] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [camBusy, setCamBusy] = useState(false);

  // -- conversation & UI state ----------------------------------------------
  const [notice, setNotice] = useState<string | null>(null);
  const [lines, setLines] = useState<LiveTranscriptLine[]>([]);
  const [pendingModel, setPendingModel] = useState('');
  const [input, setInput] = useState('');
  // Bumping this after an error restarts the session inside the open modal
  // (the effect below treats it as "a new call" while keeping the hardware).
  const [sessionNonce, setSessionNonce] = useState(0);

  // -- conversation mode ------------------------------------------------------
  // Walkie-talkie is the venue-safe default: raw server VAD misfires on gym
  // noise and hears the judge's own voice. The choice is remembered per user.
  const [pttMode, setPttMode] = useState<boolean>(() => {
    try { return localStorage.getItem('referee_live_ptt') !== 'off'; } catch { return true; }
  });
  const [pttHeld, setPttHeld] = useState(false);
  const [modelSpeaking, setModelSpeaking] = useState(false);

  const applyMode = (on: boolean) => {
    setPttMode(on);
    try { localStorage.setItem('referee_live_ptt', on ? 'on' : 'off'); } catch { /* noop */ }
    try { sessionRef.current?.setPushToTalk(on); } catch { /* noop */ }
  };

  const sessionRef = useRef<LiveRefereeSession | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Show a transient amber notice that dismisses itself. */
  const flashNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };

  // -- session lifecycle: one session per opening, always torn down --------
  useEffect(() => {
    if (!isOpen) return;

    // Fresh conversation every time the window opens.
    setStatus('idle');
    setStatusDetail('');
    setBookPages(0);
    setMicOn(true);
    setCamOn(false);
    setLines([]);
    setPendingModel('');
    setInput('');
    setNotice(null);
    setPttHeld(false);
    setModelSpeaking(false);

    // Guards setState after unmount (the async start can outlive the modal).
    let cancelled = false;
    let sess: LiveRefereeSession | null = null;
    const handleSessionError = (e: unknown) => {
      if (cancelled) return;
      setStatus('error');
      setStatusDetail(e instanceof Error && e.message ? e.message : 'החיבור נכשל. נסה שוב.');
    };
    (async () => {
      try {
        const { LiveRefereeSession } = await import('../services/liveRefereeService');
        if (cancelled) return;
        sess = new LiveRefereeSession({
          seasonName,
          rulebookFiles,
          pushToTalk: pttMode,
          callbacks: {
            onStatus: (s, detail) => {
              if (cancelled) return;
              setStatus(s);
              setStatusDetail(detail || '');
              if (s !== 'live') setPttHeld(false);
            },
            onBookProgress: (n) => { if (!cancelled) setBookPages(n); },
            onUserText: (text) => {
              if (cancelled) return;
              setLines(prev => [...prev, { who: 'user', text }]);
            },
            onModelText: (text, done) => {
              if (cancelled) return;
              if (done) {
                // A finished turn moves from the streaming line into history.
                setLines(prev => [...prev, { who: 'model', text }]);
                setPendingModel('');
              } else {
                setPendingModel(text);
              }
            },
            onInterrupted: () => { if (!cancelled) setPendingModel(''); },
            onSpeakingChange: (speaking) => { if (!cancelled) setModelSpeaking(speaking); },
            onCameraLost: (detail?: string) => {
              if (cancelled) return;
              setCamOn(false);
              flashNotice(detail || 'שליחת תמונה נכשלה. המצלמה כובתה, השיחה ממשיכה בקול.');
            },
          },
        });
        sessionRef.current = sess;
        await sess.start();
      } catch (e) {
        handleSessionError(e);
        await sess?.stop().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      sessionRef.current = null;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      void sess?.stop();
    };
    // Session intentionally depends only on opening + manual retry; props
    // are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionNonce]);

  // -- keep the newest caption visible ---------------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, pendingModel]);

  // -- control handlers --------------------------------------------------------
  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    try { sessionRef.current?.setMicEnabled(next); } catch { /* noop */ }
  };

  const toggleCamera = async () => {
    const sess = sessionRef.current;
    if (!sess || camBusy) return;
    const next = !camOn;
    setCamBusy(true);
    try {
      await sess.setCameraEnabled(next, videoRef.current);
      setCamOn(next);
    } catch (e: any) {
      flashNotice(e?.message || 'המצלמה נכשלה. נסה שוב.');
    }
    setCamBusy(false);
  };

  const sendText = () => {
    const sess = sessionRef.current;
    const text = input.trim();
    if (!sess || !text || status !== 'live') return;
    sess.sendText(text);
    // Typed lines never come back as transcripts, so echo them locally.
    setLines(prev => [...prev, { who: 'user', text }]);
    setInput('');
  };

  // -- walkie-talkie hold ---------------------------------------------------
  const holdStart = () => {
    if (!live || !pttMode || modelSpeaking) return;
    setPttHeld(true);
    try { sessionRef.current?.beginSpeak(); } catch { /* noop */ }
  };
  const holdEnd = () => {
    setPttHeld(was => {
      if (was) { try { sessionRef.current?.endSpeak(); } catch { /* noop */ } }
      return false;
    });
  };
  // Safety net: pointerup can fire outside the button (drag off, scroll).
  useEffect(() => {
    if (!pttHeld) return;
    const release = () => holdEnd();
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pttHeld]);

  const live = status === 'live';
  const busy = status === 'loading-book' || status === 'connecting';

  /** Second header line: book progress, error/server detail, or idle hint. */
  const subtitle = status === 'loading-book'
    ? `טוען חוברת חוקים כרפרנס${bookPages > 0 ? ` (${bookPages} עמודים)` : '...'}`
    : statusDetail || (live
      ? (pttMode ? 'לחצו-ודברו — החזיקו כדי לשוחח' : 'דברו או הראו משימה למצלמה')
      : 'מתחבר...');

  /** Placeholder when the transcript is still empty. */
  const emptyHint = busy
    ? 'מכין את השופט...'
    : live
      ? (pttMode ? 'לחצו והחזיקו למטה, דברו, ושחררו — השופט יענה.' : 'שאלו בקול, למשל: האם המשימה הזאת חוקית?')
      : '...';

  // No early return on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9700] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 md:p-4"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16, transition: { duration: 0.18 } }}
            transition={SPRING}
            className="w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0E1628] shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
            role="dialog"
            aria-label="שופט לייב"
          >
            {/* Header: identity + live badge + status line + close */}
            <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={live && modelSpeaking ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 0.9, repeat: live && modelSpeaking ? Infinity : 0 }}
                  className="relative w-10 h-10 rounded-full bg-white ring-2 ring-[#FFC400]/70 overflow-hidden flex items-center justify-center shrink-0"
                >
                  <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain" />
                </motion.div>
                <div className="flex-1 min-w-0 text-right">
                  <h3 className="text-base md:text-lg font-black text-white leading-tight flex items-center gap-2">
                    שופט לייב
                    <span className="text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full border bg-white/[0.04] border-white/15 text-slate-400">
                      {seasonName || 'FLL'}
                    </span>
                    <span className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      live
                        ? 'text-red-300 bg-[#E1251B]/10 border-[#E1251B]/40'
                        : status === 'error'
                          ? 'text-red-300 bg-[#E1251B]/10 border-[#E1251B]/40'
                          : 'text-slate-400 bg-white/[0.06] border-white/15'
                    }`}>
                      {live && <span className="w-1.5 h-1.5 rounded-full bg-[#E1251B] animate-pulse" aria-hidden />}
                      {live ? 'בשידור' : STATUS_LABEL[status]}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium truncate">
                    {subtitle}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="סגור"
                  className="shrink-0 p-2 rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-colors active:scale-95 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {busy && (
                <motion.div
                  className="mt-3 h-[2px] rounded-full bg-gradient-to-l from-transparent via-[#0B6BCB] to-transparent"
                  animate={{ opacity: [0.3, 1, 0.3], scaleX: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  aria-hidden
                />
              )}
            </div>

            {/* Camera: live feed with viewfinder frame, or an inviting off-state */}
            <div className="px-4 md:px-5 pt-3 shrink-0">
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/50 border border-white/10">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover ${camOn ? '' : 'hidden'}`}
                />
                {!camOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <span className="w-14 h-14 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center">
                      <Camera className="w-6 h-6" />
                    </span>
                    <span className="text-xs font-bold">המצלמה כבויה. הדליקו כדי להראות משימה לשופט.</span>
                  </div>
                )}
                {camOn && (
                  <>
                    <ViewfinderCorners />
                    <span className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-950/70 border border-[#E1251B]/40 text-red-300 backdrop-blur-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E1251B] animate-pulse" aria-hidden />
                      השופט רואה
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Transcript: finished lines plus the streaming caption */}
            <div ref={scrollRef} className="flex-1 min-h-[140px] overflow-y-auto px-4 md:px-5 py-3 space-y-2.5">
              {lines.length === 0 && !pendingModel && (
                <div className="h-full flex flex-col items-center justify-center gap-3 py-6 text-slate-500 text-sm font-medium">
                  {busy && (
                    <span className="flex items-center gap-1" aria-hidden>
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                    </span>
                  )}
                  {emptyHint}
                </div>
              )}
              <motion.div layout className="space-y-2.5">
                <AnimatePresence initial={false} mode="popLayout">
                  {lines.map((l, i) => (
                    <motion.div
                      key={`${i}-${l.text.slice(0, 12)}`}
                      layout
                      initial={{ opacity: 0, y: 14, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <TranscriptBubble who={l.who}>
                        {l.text}
                      </TranscriptBubble>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
              {pendingModel && (
                <TranscriptBubble who="model">
                  {pendingModel}
                  <span className="typewriter-cursor" aria-hidden>▍</span>
                </TranscriptBubble>
              )}
              {status === 'error' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-[#E1251B]/30 bg-[#E1251B]/10 px-4 py-3 text-center"
                >
                  <p className="text-xs font-bold text-red-200">{statusDetail || 'החיבור נכשל.'}</p>
                  <button
                    onClick={() => {
                      setStatus('idle');
                      setStatusDetail('');
                      setLines([]);
                      setPendingModel('');
                      setSessionNonce(n => n + 1);
                    }}
                    className="mt-2 rounded-lg bg-[#FFC400] px-4 py-1.5 text-xs font-black text-slate-950 active:scale-95 transition-transform cursor-pointer"
                  >
                    נסה שוב
                  </button>
                </motion.div>
              )}
              <AnimatePresence>
                {notice && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-xl border border-[#FFC400]/30 bg-[#FFC400]/10 px-4 py-2.5 text-xs font-bold text-amber-200 text-center"
                  >
                    {notice}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls: mode switch, walkie-talkie bar, typed row, call buttons */}
            <div className="px-4 md:px-5 pb-4 pt-1 shrink-0 space-y-2.5">
              <div className="flex items-center justify-center gap-1.5">
                {([true, false] as const).map(mode => (
                  <button
                    key={String(mode)}
                    onClick={() => applyMode(mode)}
                    disabled={!live && !busy}
                    className={`text-[11px] font-black px-3.5 py-1.5 rounded-full border transition-colors cursor-pointer disabled:opacity-40 ${
                      pttMode === mode
                        ? 'bg-[#0B6BCB] text-white border-[#0B6BCB]'
                        : 'bg-white/[0.04] text-slate-400 border-white/15 hover:text-white'
                    }`}
                  >
                    {mode ? 'לחצו-ודברו' : 'ידיים חופשיות'}
                  </button>
                ))}
              </div>
              <AnimatePresence initial={false} mode="popLayout">
                {pttMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <motion.button
                      whileTap={live ? { scale: 0.98 } : undefined}
                      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); holdStart(); }}
                      onPointerUp={holdEnd}
                      onContextMenu={(e) => e.preventDefault()}
                      disabled={!live}
                      className={`relative w-full rounded-2xl py-3.5 font-black text-sm transition-colors select-none touch-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                        pttHeld
                          ? 'bg-[#FFC400] text-slate-950'
                          : modelSpeaking
                            ? 'bg-white/[0.04] text-slate-500 border border-white/10'
                            : 'bg-[#0B6BCB] text-white'
                      }`}
                    >
                      {pttHeld && (
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 rounded-2xl bg-[#FFC400]/35"
                          animate={{ scale: [1, 1.03, 1], opacity: [0.8, 0.3, 0.8] }}
                          transition={{ duration: 1.1, repeat: Infinity }}
                        />
                      )}
                      <span className="relative">
                        {modelSpeaking ? 'השופט מדבר...' : pttHeld ? 'שחררו — השופט עונה' : 'לחצו והחזיקו כדי לדבר'}
                      </span>
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/30 p-1.5 pr-4 focus-within:border-[#0B6BCB] transition-colors">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
                  placeholder="או כתבו לשופט החי..."
                  disabled={!live}
                  className="flex-1 min-w-0 bg-transparent py-2 text-white text-base md:text-sm placeholder-slate-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={sendText}
                  disabled={!live || !input.trim()}
                  aria-label="שליחה"
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-[#FFC400] hover:bg-[#E6B000] text-slate-950 active:scale-95 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-4 h-4 -scale-x-100" />
                </button>
              </div>
              <div className="flex items-end justify-center gap-5 pt-1">
                {!pttMode && (
                  <RoundControl
                    onClick={toggleMic}
                    disabled={!live}
                    title={micOn ? 'כבה מיקרופון' : 'הדלק מיקרופון'}
                    caption="מיקרופון"
                    active={micOn}
                    pulse={live && micOn}
                    icon={micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                  />
                )}
                <RoundControl
                  onClick={onClose}
                  title="סיים שיחה"
                  caption="סיים"
                  danger
                  icon={<PhoneOff className="w-7 h-7" />}
                />
                <RoundControl
                  onClick={toggleCamera}
                  disabled={!live || camBusy}
                  title={camOn ? 'כבה מצלמה' : 'הדלק מצלמה'}
                  caption="מצלמה"
                  active={camOn}
                  icon={camBusy
                    ? <Loader2 className="w-6 h-6 animate-spin" />
                    : camOn ? <Camera className="w-6 h-6" /> : <CameraOff className="w-6 h-6" />}
                />
              </div>
              <p className="text-center text-[10px] text-slate-500 font-medium">
                {pttMode ? 'מצב מומלץ לאולם רועש — השופט שומע רק כשלחוצים.' : 'לשיפוט מדויק הראו את המשימה למצלמה.'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
