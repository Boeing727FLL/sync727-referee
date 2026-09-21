import { motion } from 'framer-motion';
import { Inbox, Lock, RefreshCw, Star, Trash2 } from 'lucide-react';
import { formatTime, type FeedbackEntry } from './model';
const STAGGER_STEP = 0.03;
const STAGGER_MAX = 0.3;

/** One of the three top stat tiles (count / average / praise). */
export function StatTile({ value, label, glow }: { value: string; label: string; glow: 'white' | 'gold' | 'green' }) {
  const palette = glow === 'gold'
    ? 'from-yellow-400/[0.10] to-transparent text-yellow-300 border-yellow-400/25 shadow-[0_0_24px_rgba(250,204,21,0.10)]'
    : glow === 'green'
      ? 'from-emerald-400/[0.10] to-transparent text-emerald-300 border-emerald-400/25 shadow-[0_0_24px_rgba(52,211,153,0.10)]'
      : 'from-white/[0.06] to-transparent text-white border-white/10';
  return (
    <div className={`bg-gradient-to-b border rounded-2xl p-4 text-center ${palette}`}>
      <div className="text-2xl md:text-3xl font-black tabular-nums">{value}</div>
      <div className="text-[11px] text-slate-400 font-semibold mt-1">{label}</div>
    </div>
  );
}

/** Small dark-glass toolbar button (refresh, reset timer, cancel...). */
export function GhostButton({ onClick, disabled, title, children }: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
    >
      {children}
    </button>
  );
}

/** Solid red confirmation button (delete / wipe-all second tap). */
export function DangerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-b from-red-400 to-red-600 text-white text-xs font-black hover:from-red-300 hover:to-red-500 transition-all shadow-[0_4px_14px_rgba(239,68,68,0.35)] cursor-pointer"
    >
      {children}
    </button>
  );
}

/** Five-star row; filled stars follow the rating. */
function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr" aria-label={`דירוג ${rating} מתוך 5`}>
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={`w-4 h-4 ${rating >= star ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]' : 'text-slate-700'}`}
        />
      ))}
    </div>
  );
}

/** Owner lock screen for non-owner accounts. */
export function LockGate() {
  return (
    <div className="m-auto w-full max-w-sm px-6 py-10 text-center">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute -inset-3 bg-emerald-500/15 blur-xl rounded-full" aria-hidden />
        <div className="relative w-full h-full rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-emerald-400" />
        </div>
      </div>
      <h4 className="text-white font-black mb-1">אזור מוגן</h4>
      <p className="text-slate-400 text-sm">הפידבקים פתוחים לחשבון הבעלים בלבד. התחברו עם החשבון המתאים כדי להמשיך.</p>
    </div>
  );
}

/** Shimmering placeholder while the live list loads. */
export function LoadingView() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm font-bold">
      <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
      טוען פידבקים...
    </div>
  );
}

/** Empty state when no feedback exists yet. */
export function EmptyView() {
  return (
    <div className="text-center py-12">
      <div className="relative w-16 h-16 mx-auto mb-3">
        <div className="absolute -inset-2 bg-emerald-500/10 blur-xl rounded-full" aria-hidden />
        <div className="relative w-full h-full rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
          <Inbox className="w-7 h-7 text-slate-500" />
        </div>
      </div>
      <p className="text-slate-300 font-bold text-sm">אין פידבקים עדיין</p>
      <p className="text-slate-500 text-xs mt-1">פידבקים חדשים יופיעו כאן בזמן אמת</p>
    </div>
  );
}

/** One feedback card: stars, author, requested improvements, meta line. */
export function FeedbackCard({ item, index, confirmDelete, onAskDelete, onConfirmDelete, onCancelDelete }: {
  item: FeedbackEntry;
  index: number;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * STAGGER_STEP, STAGGER_MAX), duration: 0.3 }}
      className="group relative overflow-hidden bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-emerald-400/25 rounded-2xl p-4 transition-colors"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <StarRow rating={item.rating || 0} />
          <span className="text-[11px] font-black text-slate-200 tabular-nums">{item.rating || 0}/5</span>
          <span className="text-xs text-slate-500 font-bold truncate" dir="ltr">{item.uid || 'anon'}</span>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <DangerButton onClick={onConfirmDelete}>מחק</DangerButton>
            <GhostButton onClick={onCancelDelete}>ביטול</GhostButton>
          </div>
        ) : (
          <button
            onClick={onAskDelete}
            className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
            title="מחק"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {item.improvements && (
        <div className="bg-yellow-500/[0.07] border border-yellow-500/25 rounded-xl p-3 mb-2.5">
          <div className="text-[10px] text-yellow-400 font-black mb-1">שיפורים מבוקשים</div>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{item.improvements}</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium flex-wrap">
        {item.season && <span className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10">{item.season}</span>}
        {item.language && <span>{item.language}</span>}
        {formatTime(item.createdAt) && <span>{formatTime(item.createdAt)}</span>}
      </div>
    </motion.div>
  );
}

