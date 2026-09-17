/**
 * LiveAnalyticsModal — owner's Live voice analytics + session journal.
 *
 * ACCESS: owner only (rendered only for the owner; RTDB rules enforce
 * owner-only reads server-side). Live stats + journal subscription.
 * Hebrew-only, like RefereeLogsModal.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Radio, Trash2, ChevronDown, Loader2, Clock, Users, PhoneCall, CalendarDays } from 'lucide-react';
import { onValue, remove, ref } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { liveLogsQuery, subscribeLiveStats, type LiveStats } from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';

interface LiveAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type LiveEntry = {
  id: string;
  uid?: string;
  userName?: string;
  season?: string;
  durationSec?: number;
  endReason?: string;
  turns?: Array<{ w: string; t: string }>;
  createdAt?: number;
};

const LOG_LIMIT = 200;

function fmtDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDur(sec?: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function LiveAnalyticsModal({ isOpen, onClose }: LiveAnalyticsModalProps) {
  const [stats, setStats] = useState<LiveStats>({ totalSessions: 0, totalSeconds: 0, uniqueUsers: 0 });
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const owner = isCurrentUserOwner();

  useEffect(() => {
    if (!isOpen || !owner) return;
    setLoading(true);
    const unsubStats = subscribeLiveStats(setStats);
    const unsubLogs = onValue(
      liveLogsQuery(LOG_LIMIT),
      (snap) => {
        try {
          const list: LiveEntry[] = [];
          snap.forEach((child) => {
            list.push({ id: child.key || '', ...(child.val() as object) });
          });
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setEntries(list);
        } catch {
          setEntries([]);
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => { unsubStats(); unsubLogs(); };
  }, [isOpen, owner]);

  const todayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t = start.getTime();
    return entries.filter(e => (e.createdAt || 0) >= t).length;
  }, [entries]);

  const handleDelete = async (id: string) => {
    try {
      await remove(ref(rtdb, `referee/live_logs/${id}`));
    } catch { /* owner-only; rules decide */ }
  };

  if (!owner) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 16, scale: 0.96, filter: 'blur(8px)' }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-[24px] border border-white/20 bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_64px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col max-h-[86vh]"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-black text-white">אנליטיקס לייב</h3>
              </div>
              <button
                onClick={onClose}
                aria-label="סגור"
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: <PhoneCall className="w-4 h-4" />, v: String(stats.totalSessions), l: 'שיחות' },
                  { icon: <Clock className="w-4 h-4" />, v: String(Math.round(stats.totalSeconds / 60)), l: "דקות" },
                  { icon: <CalendarDays className="w-4 h-4" />, v: String(todayCount), l: 'היום' },
                  { icon: <Users className="w-4 h-4" />, v: String(stats.uniqueUsers), l: 'משתמשים' },
                ].map((c, i) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.05] px-2 py-3 text-center">
                    <div className="text-red-300 flex justify-center">{c.icon}</div>
                    <div className="text-lg font-black text-white tabular-nums">{c.v}</div>
                    <div className="text-[10px] font-bold text-slate-400">{c.l}</div>
                  </div>
                ))}
              </div>

              <h4 className="text-sm font-black text-white pt-1">יומן שיחות לייב</h4>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : entries.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-4">אין שיחות עדיין</p>
              ) : (
                <div className="space-y-2">
                  {entries.map(e => {
                    const open = !!expanded[e.id];
                    return (
                      <div key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
                        <button
                          onClick={() => setExpanded(prev => ({ ...prev, [e.id]: !prev[e.id] }))}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-right cursor-pointer hover:bg-white/[0.04] transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-black text-white truncate">
                              {e.userName || 'משתמש'} <span className="text-slate-400 font-bold">· {fmtDur(e.durationSec)}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold">
                              {fmtDate(e.createdAt)}{e.season ? ` · ${e.season}` : ''}
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                        {open && (
                          <div className="px-3 pb-2 space-y-1.5">
                            {(e.turns || []).length === 0 && (
                              <p className="text-[11px] text-slate-500 font-bold">אין תמליל</p>
                            )}
                            {(e.turns || []).map((turn, i) => (
                              <p key={i} className={`text-[11px] leading-relaxed ${turn.w === 'referee' ? 'text-amber-100' : 'text-sky-200'}`}>
                                <span className="font-black">{turn.w === 'referee' ? 'שופט' : 'משתמש'}: </span>
                                <span className="font-medium">{turn.t}</span>
                              </p>
                            ))}
                            <button
                              onClick={() => void handleDelete(e.id)}
                              className="flex items-center gap-1 text-[11px] font-bold text-red-300/80 hover:text-red-200 transition-colors cursor-pointer pt-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              מחק רשומה
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
