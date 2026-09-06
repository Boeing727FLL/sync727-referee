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
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mic, MicOff, Camera, CameraOff, PhoneOff, Send, Loader2,
} from 'lucide-react';
import { LiveRefereeSession, type LiveStatus, type LiveTranscriptLine } from '../services/liveRefereeService';

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
  'loading-book': 'טוען חוברת חוקים...',
  connecting: 'מתחבר לשופט החי...',
  live: 'מחובר, מדברים',
  error: 'שגיאת חיבור',
};

/** How long a transient notice (camera hiccup, etc.) stays on screen. */
const NOTICE_MS = 3500;

// ---------------------------------------------------------------------------
// Small presentational pieces (no hooks, no logic)
// ---------------------------------------------------------------------------

/** One round call button with its caption underneath (mic / hang up / camera). */
function RoundControl({ onClick, disabled, title, caption, active, danger, icon }: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  caption: string;
  active?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
}) {
  const palette = danger
    ? 'bg-gradient-to-b from-red-400 to-red-600 hover:from-red-300 hover:to-red-500 text-white shadow-[0_8px_28px_rgba(239,68,68,0.5)]'
    : active
      ? 'bg-gradient-to-b from-yellow-300 to-yellow-500 text-slate-950 shadow-[0_6px_24px_rgba(250,204,21,0.45)]'
      : 'bg-white/[0.06] border border-white/15 text-slate-400 hover:text-white hover:border-white/25';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
        title={title}
        className={`${danger ? 'w-16 h-16' : 'w-14 h-14'} rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 active:scale-95 ${palette}`}
      >
        {icon}
      </button>
      <span className="text-[10px] font-bold text-slate-500">{caption}</span>
    </div>
  );
}

/** The four gold viewfinder corners drawn over a live camera feed. */
function ViewfinderCorners() {
  const base = 'absolute w-6 h-6 border-yellow-300/90 pointer-events-none';
  return (
    <>
      <span className={`${base} top-3 left-3 border-t-[3px] border-l-[3px] rounded-tl-xl`} aria-hidden />
      <span className={`${base} top-3 right-3 border-t-[3px] border-r-[3px] rounded-tr-xl`} aria-hidden />
      <span className={`${base} bottom-3 left-3 border-b-[3px] border-l-[3px] rounded-bl-xl`} aria-hidden />
      <span className={`${base} bottom-3 right-3 border-b-[3px] border-r-[3px] rounded-br-xl`} aria-hidden />
    </>
  );
}

/** One transcript bubble; user lines sit on the outer side, model lines glow gold. */
function TranscriptBubble({ who, children }: { who: 'user' | 'model'; children: React.ReactNode }) {
  return (
    <div className={`flex ${who === 'user' ? 'justify-start flex-row-reverse' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        who === 'user'
          ? 'bg-white/[0.09] border border-white/10 text-slate-100'
          : 'bg-yellow-400/[0.08] border border-yellow-400/25 text-slate-100'
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

    // Guards setState after unmount (the async start can outlive the modal).
    let cancelled = false;
    const sess = new LiveRefereeSession({
      seasonName,
      rulebookFiles,
      callbacks: {
        onStatus: (s, detail) => {
          if (cancelled) return;
          setStatus(s);
          setStatusDetail(detail || '');
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
        onCameraLost: (detail?: string) => {
          if (cancelled) return;
          setCamOn(false);
          flashNotice(detail || 'שליחת תמונה נכשלה. המצלמה כובתה, השיחה ממשיכה בקול.');
        },
      },
    });
    sessionRef.current = sess;
    (async () => {
      try {
        await sess.start();
      } catch (e: any) {
        if (!cancelled) {
          setStatus('error');
          setStatusDetail(e?.message || 'החיבור נכשל. נסה שוב.');
        }
        await sess.stop().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      sessionRef.current = null;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      void sess.stop();
    };
    // Session intentionally depends only on opening; props are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  const live = status === 'live';
  const busy = status === 'loading-book' || status === 'connecting';

  /** Second header line: book progress, error/server detail, or idle hint. */
  const subtitle = status === 'loading-book'
    ? `טוען חוברת חוקים כרפרנס${bookPages > 0 ? ` (${bookPages} עמודים)` : '...'}`
    : statusDetail || (live ? 'דברו או הראו משימה למצלמה' : 'מתחבר...');

  /** Placeholder when the transcript is still empty. */
  const emptyHint = busy
    ? 'מכין את השופט...'
    : live ? 'שאלו בקול, למשל: האם המשימה הזאת חוקית?' : '...';

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
            exit={{ scale: 0.94, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-[28px] border border-yellow-400/35 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_70px_rgba(250,204,21,0.12)]"
            role="dialog"
            aria-label="שופט לייב"
          >
            {/* Header: identity + live badge + status line + close */}
            <div className="px-4 md:px-5 pt-4 pb-3 border-b border-white/10 bg-white/[0.03] shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full bg-white ring-2 ring-yellow-400/70 shadow-[0_0_16px_rgba(250,204,21,0.35)] overflow-hidden flex items-center justify-center shrink-0">
                  <img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <h3 className="text-base md:text-lg font-black text-white leading-tight flex items-center gap-2">
                    שופט לייב
                    <span className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      live
                        ? 'text-red-300 bg-red-500/15 border-red-500/40'
                        : 'text-slate-400 bg-white/[0.06] border-white/15'
                    }`}>
                      {live ? '● בשידור' : STATUS_LABEL[status]}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium truncate">
                    {subtitle}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="סגור"
                  className="shrink-0 p-2 rounded-full bg-white/[0.06] text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="h-[2px] shrink-0 bg-gradient-to-l from-transparent via-yellow-400/60 to-transparent" aria-hidden />

            {/* Camera: live feed with viewfinder frame, or an inviting off-state */}
            <div className="px-4 md:px-5 pt-3 shrink-0">
              <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-slate-950/70 border border-white/10 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]">
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
                    <span className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-950/70 border border-red-500/40 text-red-300 backdrop-blur-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden />
                      השופט רואה
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Transcript: finished lines plus the streaming caption */}
            <div ref={scrollRef} className="flex-1 min-h-[140px] overflow-y-auto px-4 md:px-5 py-3 space-y-2.5">
              {lines.length === 0 && !pendingModel && (
                <div className="text-center py-6 text-slate-500 text-sm font-medium">
                  {emptyHint}
                </div>
              )}
              {lines.map((l, i) => (
                <TranscriptBubble key={i} who={l.who}>
                  {l.text}
                </TranscriptBubble>
              ))}
              {pendingModel && (
                <TranscriptBubble who="model">
                  {pendingModel}
                  <span className="typewriter-cursor" aria-hidden>▍</span>
                </TranscriptBubble>
              )}
              {status === 'error' && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-200 text-center">
                  {statusDetail || 'החיבור נכשל.'}
                </div>
              )}
              {notice && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-200 text-center">
                  {notice}
                </div>
              )}
            </div>

            {/* Controls: typed message row, then the call buttons */}
            <div className="px-4 md:px-5 pb-4 pt-1 shrink-0 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
                  placeholder="או כתבו לשופט החי..."
                  disabled={!live}
                  className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-base md:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400/60 transition-all disabled:opacity-50"
                />
                <button
                  onClick={sendText}
                  disabled={!live || !input.trim()}
                  aria-label="שליחה"
                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 shadow-[0_4px_16px_rgba(250,204,21,0.35)] active:scale-95 transition-all disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-4 h-4 -scale-x-100" />
                </button>
              </div>
              <div className="flex items-end justify-center gap-5">
                <RoundControl
                  onClick={toggleMic}
                  disabled={!live}
                  title={micOn ? 'כבה מיקרופון' : 'הדלק מיקרופון'}
                  caption="מיקרופון"
                  active={micOn}
                  icon={micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                />
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
                לשיפוט מדויק הראו את המשימה למצלמה.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
