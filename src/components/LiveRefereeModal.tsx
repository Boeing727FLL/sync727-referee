import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, PhoneOff, Volume2, Loader2, Radio, Send } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import {
  LiveRefereeSession,
  type LiveEndReason,
  type LiveStatus,
} from '../services/liveRefereeService';
import {
  DAILY_LIVE_LIMIT,
  LIVE_MAX_SESSION_MS,
  consumeLiveQuota,
  getLiveRemaining,
} from '../lib/liveQuota';

/**
 * LiveRefereeModal — voice chat with the Live referee.
 * Strict by design: 3 sessions/day, 5-min cooldown, 5-min max session.
 * Quota is consumed only after the session actually opens.
 */
interface LiveRefereeModalProps {
  isOpen: boolean;
  uid: string;
  onClose: () => void;
}

type Phase = 'intro' | 'connecting' | 'live' | 'ended';

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const STATUS_DOT: Record<LiveStatus, string> = {
  connecting: 'bg-amber-300',
  live: 'bg-emerald-300',
  listening: 'bg-sky-300',
  speaking: 'bg-[#FFC400]',
  thinking: 'bg-violet-300',
  ended: 'bg-slate-500',
};

export default function LiveRefereeModal({ isOpen, uid, onClose }: LiveRefereeModalProps) {
  const { t, isRTL } = useLanguage();
  const [phase, setPhase] = useState<Phase>('intro');
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [lines, setLines] = useState<Array<{ who: 'you' | 'referee'; text: string }>>([]);
  const [remaining, setRemaining] = useState<number>(DAILY_LIVE_LIMIT);
  const [error, setError] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<LiveEndReason | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [timeLeft, setTimeLeft] = useState(LIVE_MAX_SESSION_MS);
  const [draft, setDraft] = useState('');
  const sessionRef = useRef<LiveRefereeSession | null>(null);
  const liveSinceRef = useRef(0);
  const consumedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Fresh state on every open.
  useEffect(() => {
    if (!isOpen) return;
    setPhase('intro');
    setStatus('connecting');
    setLines([]);
    setError(null);
    setEndReason(null);
    setMicOn(true);
    setTimeLeft(LIVE_MAX_SESSION_MS);
    setDraft('');
    consumedRef.current = false;
    liveSinceRef.current = 0;
    void getLiveRemaining(uid).then(setRemaining).catch(() => undefined);
    return () => {
      try { sessionRef.current?.stop(); } catch { /* ignore */ }
      sessionRef.current = null;
    };
  }, [isOpen, uid]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines, phase]);

  // Countdown while live.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => {
      if (liveSinceRef.current) setTimeLeft(LIVE_MAX_SESSION_MS - (Date.now() - liveSinceRef.current));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  const appendLine = (who: 'you' | 'referee', text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setLines(prev => {
      const last = prev[prev.length - 1];
      if (last && last.who === who) {
        const merged = [...prev];
        merged[merged.length - 1] = { who, text: `${last.text} ${clean}` };
        return merged;
      }
      return [...prev, { who, text: clean }];
    });
  };

  const handleStart = async () => {
    setError(null);
    setPhase('connecting');
    setStatus('connecting');
    const session = new LiveRefereeSession({
      onStatus: (s) => {
        setStatus(s);
        if (s === 'live' && !consumedRef.current) {
          consumedRef.current = true;
          liveSinceRef.current = Date.now();
          setPhase('live');
          // Quota only after the session truly opened — failed connects cost nothing.
          consumeLiveQuota(uid)
            .then(() => getLiveRemaining(uid).then(setRemaining).catch(() => undefined))
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              setError(msg);
              try { sessionRef.current?.stop(); } catch { /* ignore */ }
              setPhase('ended');
              setEndReason('error');
            });
        }
      },
      onTranscript: (who, text) => appendLine(who, text),
      onError: (message) => setError(message),
      onEnd: (reason) => {
        setEndReason(reason);
        setPhase('ended');
      },
    });
    sessionRef.current = session;
    try {
      await session.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase('intro');
      sessionRef.current = null;
    }
  };

  const handleEnd = () => {
    try { sessionRef.current?.stop(); } catch { /* ignore */ }
    sessionRef.current = null;
    setPhase('ended');
    setEndReason(r => r ?? 'user');
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    sessionRef.current?.setMicEnabled(next);
  };

  const sendDraft = () => {
    if (!draft.trim()) return;
    sessionRef.current?.sendText(draft);
    setDraft('');
  };

  const statusKey: Record<LiveStatus, string> = {
    connecting: 'live.connecting',
    live: 'live.live',
    listening: 'live.listening',
    speaking: 'live.speaking',
    thinking: 'live.thinking',
    ended: 'live.ended',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
          dir={isRTL ? 'rtl' : 'ltr'}
          onClick={phase === 'live' ? undefined : onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 16, scale: 0.96, filter: 'blur(8px)' }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-[24px] border border-white/20 bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_64px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col max-h-[86vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                <h3 className="text-base font-black text-white">{t('live.title')}</h3>
              </div>
              <div className="flex items-center gap-2">
                {phase === 'live' && (
                  <span className="text-xs font-black text-slate-200 tabular-nums bg-white/10 px-2 py-1 rounded-lg" dir="ltr">
                    {fmtClock(timeLeft)}
                  </span>
                )}
                {phase !== 'live' && (
                  <button
                    onClick={onClose}
                    aria-label="סגור"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto" ref={scrollRef}>
              {phase === 'intro' && (
                <div className="text-center space-y-3">
                  <p className="text-sm text-slate-200 font-bold leading-relaxed">{t('live.intro')}</p>
                  <div className="rounded-2xl border border-[#FFC400]/30 bg-[#FFC400]/10 px-4 py-3 text-right space-y-1">
                    <p className="text-xs text-amber-100 font-bold">• {t('live.limitDaily').replace('{n}', String(DAILY_LIVE_LIMIT))}</p>
                    <p className="text-xs text-amber-100 font-bold">• {t('live.limitLength')}</p>
                    <p className="text-xs text-amber-100 font-bold">• {t('live.limitCooldown')}</p>
                  </div>
                  <p className="text-xs text-slate-300 font-bold">
                    {t('live.remaining').replace('{n}', String(remaining)).replace('{total}', String(DAILY_LIVE_LIMIT))}
                  </p>
                  {error && <p className="text-xs text-red-300 font-bold">{error}</p>}
                  <button
                    onClick={handleStart}
                    disabled={remaining <= 0}
                    className="w-full px-4 py-3 rounded-2xl bg-gradient-to-b from-red-400 to-red-600 hover:from-red-300 hover:to-red-500 text-white font-black text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(239,68,68,0.35)]"
                  >
                    <Mic className="w-4 h-4" />
                    {t('live.start')}
                  </button>
                </div>
              )}

              {phase === 'connecting' && (
                <div className="text-center py-8 space-y-3">
                  <Loader2 className="w-8 h-8 text-[#FFC400] animate-spin mx-auto" />
                  <p className="text-sm text-slate-200 font-bold">{t('live.connecting')}</p>
                </div>
              )}

              {(phase === 'live' || phase === 'ended') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]} animate-pulse`} />
                    <span className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                      {status === 'speaking' && <Volume2 className="w-3.5 h-3.5" />}
                      {status === 'thinking' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {status === 'live' && <Radio className="w-3.5 h-3.5" />}
                      {status === 'listening' && <Mic className="w-3.5 h-3.5" />}
                      {t(statusKey[status])}
                    </span>
                  </div>
                  <div className="min-h-[120px] max-h-[240px] overflow-y-auto space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                    {lines.length === 0 && phase === 'live' && (
                      <p className="text-[11px] text-slate-400 font-bold text-center">{t('live.speakNow')}</p>
                    )}
                    {lines.map((l, i) => (
                      <div key={i} className={`text-xs leading-relaxed ${l.who === 'you' ? 'text-sky-200' : 'text-amber-100'}`}>
                        <span className="font-black">{l.who === 'you' ? t('live.you') : t('live.referee')}: </span>
                        <span className="font-medium">{l.text}</span>
                      </div>
                    ))}
                  </div>
                  {phase === 'ended' && (
                    <p className="text-xs text-slate-300 font-bold text-center">
                      {endReason === 'timeout' ? t('live.timeoutMsg') : endReason === 'user' ? t('live.userEndedMsg') : t('live.closedMsg')}
                    </p>
                  )}
                  {error && <p className="text-xs text-red-300 font-bold text-center">{error}</p>}
                </div>
              )}
            </div>

            {/* Footer controls */}
            {phase === 'live' && (
              <div className="px-4 pb-4 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendDraft(); }}
                    placeholder={t('live.typePlaceholder')}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-slate-400 font-medium outline-none focus:border-[#FFC400]/50"
                  />
                  <button
                    onClick={sendDraft}
                    aria-label={t('live.send')}
                    className="shrink-0 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                  >
                    <Send className="w-4 h-4 rtl:rotate-180" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={toggleMic}
                    className={`flex-1 px-4 py-2.5 rounded-xl font-black text-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 border ${micOn ? 'bg-white/10 hover:bg-white/20 border-white/15 text-white' : 'bg-amber-400/20 border-amber-300/40 text-amber-100'}`}
                  >
                    {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {micOn ? t('live.mute') : t('live.unmute')}
                  </button>
                  <button
                    onClick={handleEnd}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-b from-red-400 to-red-600 hover:from-red-300 hover:to-red-500 text-white font-black text-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <PhoneOff className="w-4 h-4" />
                    {t('live.end')}
                  </button>
                </div>
              </div>
            )}
            {phase === 'ended' && (
              <div className="px-4 pb-4">
                <button
                  onClick={onClose}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-black text-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  {t('live.close')}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
