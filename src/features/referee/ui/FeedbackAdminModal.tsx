import { useLanguage } from '../../../hooks/useLanguage';
/**
 * FeedbackAdminModal — owner-only floating viewer for user feedback.
 *
 * WHAT: live star ratings + improvement notes from the RTDB `referee/feedback`
 * tree, with per-item delete, wipe-all, manual refresh, and the global
 * feedback-popup timer reset. Opens from the analytics panel; never a page,
 * so the chat underneath stays alive.
 *
 * ACCESS: the whole viewer gates on the owner account. Everyone else sees
 * the lock screen. Deletes are additionally enforced by the server rules.
 */

import { motion } from 'framer-motion';
import ModalScrim from './ModalScrim';
import { X, MessageSquareHeart, RefreshCw, Trash2, Check } from 'lucide-react';
import { feedbackStats } from '../../../features/referee/feedback/model';
import { DangerButton, EmptyView, FeedbackCard, GhostButton, LoadingView, LockGate, StatTile } from '../../../features/referee/feedback/FeedbackViews';
import { useModalA11y } from '../../../lib/modalA11y';
import useFeedbackAdmin from '../../../features/referee/feedback/useFeedbackAdmin';

// ---------------------------------------------------------------------------
// Configuration constants (no magic numbers in logic or JSX below)
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// The modal: owner gate -> live list (stats, toolbar, cards)
// ---------------------------------------------------------------------------

export default function FeedbackAdminModal({ isOpen, onClose }: FeedbackAdminModalProps) {
  const { t, isRTL } = useLanguage();
  const a11yRef = useModalA11y(onClose);
  const {
    unlocked, items, loading,
    confirmDeleteId, setConfirmDeleteId, confirmClearAll, setConfirmClearAll,
    refreshing, resetPopupTimer, resettingTimer, timerReset, actionError,
    refreshFromServer, handleDelete, handleClearAll,
  } = useFeedbackAdmin(isOpen);
  const { total, avg, highCount, lowCount } = feedbackStats(items);

  // No early return on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation.
  return (
    <ModalScrim isOpen={isOpen} isRTL={isRTL} layerClass="z-[10000] modal-safe-3" admin quickFade onClose={onClose}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="v12-sheet w-full max-w-3xl max-h-[90dvh] flex flex-col"
            ref={a11yRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            {/* Header: glowing identity + live pulse + close */}
            <div className="px-5 md:px-6 pt-4 md:pt-5 pb-4 border-b border-white/10 bg-white/[0.03] shrink-0 relative overflow-hidden">
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-96 h-32 bg-emerald-400/[0.08] rounded-full blur-3xl pointer-events-none" aria-hidden />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="absolute -inset-2 bg-emerald-500/20 blur-xl rounded-full pointer-events-none" aria-hidden />
                    <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-emerald-500/10 border border-emerald-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.25)]">
                      <MessageSquareHeart className="w-5 h-5 text-emerald-300" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-white leading-tight">{t('owner.feedbackTitle')}</h3>
                    <p className="text-[11px] md:text-xs text-white/65 font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
                      {t('owner.realtime')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 rounded-full bg-white/[0.12] border border-white/10 text-white hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="h-[2px] shrink-0 bg-gradient-to-l from-transparent via-emerald-400/60 to-transparent" aria-hidden />

            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4">
              {actionError && (
                <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/15 border border-red-400/40 text-red-300 text-sm font-bold flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" aria-hidden />
                  {actionError}
                </div>
              )}
              {timerReset && (
                <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-sm font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" aria-hidden />
                  {t('owner.feedbackTimerConfirm')}
                </div>
              )}

              {!unlocked ? (
                <LockGate />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2.5 md:gap-3">
                    <StatTile value={String(total)} label={t('owner.feedbackTotal')} glow="white" />
                    <StatTile value={total > 0 ? avg.toFixed(1) : '—'} label={t('owner.averageRating')} glow="gold" />
                    <StatTile value={String(highCount)} label={t('owner.highRating')} glow="green" />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm text-white/65 font-bold">
                      {total} {total === 1 ? t('owner.feedbackSingle') : t('owner.feedbackPlural')}
                      {lowCount > 0 && <span className="text-red-300/90"> • {t('owner.lowRating').replace('{count}', String(lowCount))}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <GhostButton
                        onClick={resetPopupTimer}
                        disabled={resettingTimer}
                        title={t('owner.feedbackTimerTip')}
                      >
                        {resettingTimer ? t('owner.resetting') : t('owner.resetFeedback')}
                      </GhostButton>
                      <GhostButton onClick={refreshFromServer} disabled={refreshing}>
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        {t('owner.refresh')}
                      </GhostButton>
                      {total > 0 && (
                        confirmClearAll ? (
                          <div className="flex items-center gap-1.5">
                            <DangerButton onClick={handleClearAll}>{t('owner.deleteAll')}</DangerButton>
                            <GhostButton onClick={() => setConfirmClearAll(false)}>{t('owner.cancel')}</GhostButton>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClearAll(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-500/25 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('owner.deleteAll')}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {loading ? (
                      <LoadingView />
                    ) : items.length === 0 ? (
                      <EmptyView />
                    ) : (
                      items.map((item, idx) => (
                        <FeedbackCard
                          key={item.id}
                          item={item}
                          index={idx}
                          confirmDelete={confirmDeleteId === item.id}
                          onAskDelete={() => setConfirmDeleteId(item.id)}
                          onConfirmDelete={() => handleDelete(item.id)}
                          onCancelDelete={() => setConfirmDeleteId(null)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
    </ModalScrim>
  );
}
