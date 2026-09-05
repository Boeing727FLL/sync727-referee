import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mic, MicOff, Camera, CameraOff, PhoneOff, Send, Loader2,
} from 'lucide-react';
import { LiveRefereeSession, type LiveStatus, type LiveTranscriptLine } from '../services/liveRefereeService';

interface LiveRefereeModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasonName: string;
  rulebookFiles: { name: string; url: string }[];
}

const STATUS_LABEL: Record<LiveStatus, string> = {
  idle: 'מוכן',
  'loading-book': 'טוען חוברת חוקים...',
  connecting: 'מתחבר לשופט החי...',
  live: 'מחובר, מדברים',
  error: 'שגיאת חיבור',
};

export default function LiveRefereeModal({ isOpen, onClose, seasonName, rulebookFiles }: LiveRefereeModalProps) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [bookPages, setBookPages] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lines, setLines] = useState<LiveTranscriptLine[]>([]);
  const [pendingModel, setPendingModel] = useState('');
  const [input, setInput] = useState('');

  const sessionRef = useRef<LiveRefereeSession | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  };

  useEffect(() => {
    if (!isOpen) return;
    setStatus('idle');
    setStatusDetail('');
    setBookPages(0);
    setMicOn(true);
    setCamOn(false);
    setLines([]);
    setPendingModel('');
    setInput('');
    setNotice(null);

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
            setLines(prev => [...prev, { who: 'model', text }]);
            setPendingModel('');
          } else {
            setPendingModel(text);
          }
        },
        onInterrupted: () => { if (!cancelled) setPendingModel(''); },
        onCameraLost: () => {
          if (cancelled) return;
          setCamOn(false);
          flashNotice('שליחת תמונה נכשלה. המצלמה כובתה, השיחה ממשיכה בקול.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, pendingModel]);

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
    setLines(prev => [...prev, { who: 'user', text }]);
    setInput('');
  };

  const live = status === 'live';
  const busy = status === 'loading-book' || status === 'connecting';

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
            className="w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-yellow-400/25 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(250,204,21,0.08)]"
            role="dialog"
            aria-label="שופט לייב"
          >
            {/* Header */}
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
                    {status === 'loading-book'
                      ? `טוען חוברת חוקים כרפרנס${bookPages > 0 ? ` (${bookPages} עמודים)` : '...'}`
                      : statusDetail || (live ? 'דברו או הראו משימה למצלמה' : 'מתחבר...')}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="סגור"
                  className="shrink-0 p-2 rounded-xl bg-white/[0.06] text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all active:scale-95 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Camera */}
            <div className="px-4 md:px-5 pt-3 shrink-0">
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-950/70 border border-white/10">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover ${camOn ? '' : 'hidden'}`}
                />
                {!camOn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <Camera className="w-8 h-8" />
                    <span className="text-xs font-bold">המצלמה כבויה. הדליקו כדי להראות משימה לשופט.</span>
                  </div>
                )}
                {camOn && (
                  <span className="absolute top-2 right-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/80 text-white">
                    השופט רואה
                  </span>
                )}
              </div>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 min-h-[140px] overflow-y-auto px-4 md:px-5 py-3 space-y-2.5">
              {lines.length === 0 && !pendingModel && (
                <div className="text-center py-6 text-slate-500 text-sm font-medium">
                  {busy ? 'מכין את השופט...' : live ? 'שאלו בקול, למשל: האם המשימה הזאת חוקית?' : '...'}
                </div>
              )}
              {lines.map((l, i) => (
                <div key={i} className={`flex ${l.who === 'user' ? 'justify-start flex-row-reverse' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    l.who === 'user'
                      ? 'bg-white/[0.09] border border-white/10 text-slate-100'
                      : 'bg-yellow-400/[0.08] border border-yellow-400/25 text-slate-100'
                  }`}>
                    <div className="whitespace-pre-wrap break-words">{l.text}</div>
                  </div>
                </div>
              ))}
              {pendingModel && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-yellow-400/[0.08] border border-yellow-400/25 text-slate-100">
                    <span className="whitespace-pre-wrap break-words">{pendingModel}</span>
                    <span className="typewriter-cursor" aria-hidden>▍</span>
                  </div>
                </div>
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

            {/* Controls */}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMic}
                  disabled={!live}
                  aria-label={micOn ? 'כבה מיקרופון' : 'הדלק מיקרופון'}
                  title={micOn ? 'כבה מיקרופון' : 'הדלק מיקרופון'}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border font-bold text-sm transition-all cursor-pointer disabled:opacity-40 ${
                    micOn
                      ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-200'
                      : 'bg-white/[0.05] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  {micOn ? 'מיקרופון דולק' : 'מיקרופון כבוי'}
                </button>
                <button
                  onClick={toggleCamera}
                  disabled={!live || camBusy}
                  aria-label={camOn ? 'כבה מצלמה' : 'הדלק מצלמה'}
                  title={camOn ? 'כבה מצלמה' : 'הדלק מצלמה'}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border font-bold text-sm transition-all cursor-pointer disabled:opacity-40 ${
                    camOn
                      ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-200'
                      : 'bg-white/[0.05] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {camBusy
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : camOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                  {camOn ? 'מצלמה דולקת' : 'מצלמה כבויה'}
                </button>
                <button
                  onClick={onClose}
                  aria-label="סיים שיחה"
                  title="סיים שיחה"
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-b from-red-400 to-red-600 hover:from-red-300 hover:to-red-500 text-white shadow-[0_4px_16px_rgba(239,68,68,0.4)] active:scale-95 transition-all cursor-pointer"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
              </div>
              <p className="text-center text-[10px] text-slate-500 font-medium">
                שופט לייב מדבר בעברית. לשיפוט מדויק הראו את המשימה למצלמה.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
