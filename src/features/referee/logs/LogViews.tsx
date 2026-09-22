/** Pure presentation pieces for the referee journal. */
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, CalendarDays, Check, ChevronDown, ChevronUp, Copy, Loader2, MessageCircle, Sparkles, Trash2, UserRound } from 'lucide-react';
import { fullDate, resolveAskerName, timeAgo, type LogEntry, type UserNameMap } from './model';

const STAGGER_STEP = 0.03;
const STAGGER_MAX = 0.3;

/** Amber/red inline banner for permission and failure states. */
export function NoticeBanner({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  const palette = tone === 'amber'
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    : 'border-red-500/30 bg-red-500/10 text-red-200';
  return (
    <div className={`mx-4 md:mx-5 mt-3 rounded-xl border px-4 py-2.5 text-xs font-bold shrink-0 ${palette}`}>
      {children}
    </div>
  );
}

/** The small copy button inside expanded Q/A cards, with its copied tick. */
function CopyButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <button
      onClick={onCopy}
      className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400">הועתק</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          העתק
        </>
      )}
    </button>
  );
}

/** One time-range chip; the active one glows blue. */
export function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-black border transition-all cursor-pointer ${
        active
          ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white border-blue-500 shadow-[0_4px_12px_rgba(37,99,235,0.35)]'
          : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );
}

/** Shimmering placeholder rows while the live list loads. */
export function LoadingSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-white/5 bg-slate-800/40 p-4 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-slate-700/60 mb-3" />
          <div className="h-3 w-1/2 rounded bg-slate-700/40" />
        </div>
      ))}
    </>
  );
}

/** Empty state when filters/search match nothing. */
export function EmptyState() {
  return (
    <div className="text-center py-14">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-slate-500" />
      </div>
      <p className="text-slate-300 font-bold text-sm">אין תוצאות</p>
      <p className="text-slate-500 text-xs mt-1">נסו לחפש משהו אחר או לאפס סינון</p>
    </div>
  );
}

/** One expandable journal row: collapsed header + expandable Q/A detail. */
export function EntryRow({ entry, names, index, isExpanded, onToggle, onDelete, canDelete, deleting, copiedKey, onCopy }: {
  entry: LogEntry;
  names: UserNameMap;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  canDelete: boolean;
  deleting: boolean;
  copiedKey: string | null;
  onCopy: (key: string, text?: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * STAGGER_STEP, STAGGER_MAX), duration: 0.3 }}
      className={`rounded-2xl border overflow-hidden transition-colors ${
        isExpanded
          ? 'border-blue-500/30 bg-slate-800/70 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
          : 'border-white/8 bg-slate-800/40 hover:border-white/15 hover:bg-slate-800/60'
      }`}
    >
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-right"
      >
        <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border bg-blue-500/10 border-blue-500/25 text-blue-300">
          <MessageCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate leading-snug">
            {entry.question || 'ללא שאלה'}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {entry.season && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-200">
                {entry.season}
              </span>
            )}
            <span className="min-w-0 max-w-full text-[10px] text-slate-300 font-bold flex items-center gap-1" title={resolveAskerName(entry, names)}>
              <UserRound className="w-3 h-3 shrink-0 text-blue-300" />
              <span className="truncate">{resolveAskerName(entry, names)}</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 shrink-0">
              <CalendarDays className="w-3 h-3" />
              {timeAgo(entry.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting || !canDelete}
            className="p-2 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500 disabled:hover:bg-transparent"
            title={canDelete ? 'מחיקת רשומה' : 'מחיקה לבעלים בלבד'}
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
          <div className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-blue-300" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2.5">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-black text-blue-200">
                    <MessageCircle className="w-3.5 h-3.5" />
                    שאלה
                  </span>
                  <CopyButton copied={copiedKey === `${entry.id}q`} onCopy={() => onCopy(`${entry.id}q`, entry.question)} />
                </div>
                <div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                  {entry.question}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-black text-slate-200">
                    <Bot className="w-3.5 h-3.5" />
                    תשובה
                  </span>
                  <CopyButton copied={copiedKey === `${entry.id}a`} onCopy={() => onCopy(`${entry.id}a`, entry.answer)} />
                </div>
                <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                  {entry.answer || 'אין תשובה שמורה'}
                </div>
              </div>

              <div className="px-1">
                <span className="text-[10px] text-slate-500 font-medium">
                  {fullDate(entry.createdAt)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

