/**
 * AdminAnalyticsModal — owner-only floating dashboard (floating window).
 *
 * WHAT: four live tiles (questions asked, registered users, online now,
 * per-user average) plus two actions: open the feedback viewer and reset
 * the question counters. Opens from Settings; the feedback viewer opens
 * on top of it. The chat underneath never unmounts.
 *
 * ACCESS: the whole body gates on the owner account. Everyone else sees
 * the lock screen. Counter resets additionally need a second tap.
 *
 * DESIGN: Apple-calm dark. Airy stat tiles with tabular numerals, one
 * hairline divider, pill actions — single soft shadow, no glow stacks.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, BarChart3, MessageSquareText, Users, Activity, RotateCcw, UserCheck, MessageSquareHeart } from 'lucide-react';
import { subscribeAnalytics, resetQuestions, onOnlineUsersChange, type AnalyticsStats } from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';
import FeedbackAdminModal from './FeedbackAdminModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Presentational pieces (no hooks, no logic — pure props in, JSX out)
// ---------------------------------------------------------------------------

/** One airy stat tile: tinted icon chip, tabular numeral, quiet label. */
function StatTile({ icon, tint, label, value, sub }: {
  icon: React.ReactNode;
  tint: 'gold' | 'blue' | 'green' | 'violet';
  label: string;
  value: string | number;
  sub?: string;
}) {
  const chip = {
    gold: 'bg-yellow-400/12 border-yellow-400/25 text-yellow-300',
    blue: 'bg-blue-500/12 border-blue-500/25 text-blue-300',
    green: 'bg-emerald-400/12 border-emerald-400/25 text-emerald-300',
    violet: 'bg-violet-500/12 border-violet-500/25 text-violet-300',
  }[tint];
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${chip}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-400 font-semibold mb-1">{label}</div>
        <div className="text-xl md:text-2xl font-black text-white tabular-nums leading-none">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

/** Wide pill action button (feedback viewer / counter reset). */
function ActionButton({ onClick, disabled, tone, children }: {
  onClick: () => void;
  disabled?: boolean;
  tone: 'green' | 'red';
  children: React.ReactNode;
}) {
  const palette = tone === 'green'
    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
    : 'bg-red-500/12 border-red-500/35 text-red-300 hover:bg-red-500/22';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 ${palette}`}
    >
      {children}
    </button>
  );
}

/** Owner lock screen for non-owner accounts. */
function LockGate({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute -inset-2 bg-white/10 blur-xl rounded-full" aria-hidden />
          <div className="relative w-full h-full rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-slate-300" />
          </div>
        </div>
        <h4 className="text-white font-black mb-1">אזור מוגן</h4>
        <p className="text-slate-400 text-sm">האנליטיקס פתוח לחשבון הבעלים בלבד.</p>
      </div>
      <button
        onClick={onClose}
        className="w-full py-3 rounded-2xl bg-white/[0.07] hover:bg-white/10 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer"
      >
        סגור
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The modal: live tiles + two owner actions
// ---------------------------------------------------------------------------

export default function AdminAnalyticsModal({ isOpen, onClose }: AdminAnalyticsModalProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showFeedbackAdmin, setShowFeedbackAdmin] = useState(false);

  // Fresh gate on every opening; online presence streams regardless.
  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setConfirmReset(false);
      setShowFeedbackAdmin(false);
      return;
    }
    setUnlocked(isCurrentUserOwner());
    const unsubOnline = onOnlineUsersChange(setOnlineUsers);
    return () => unsubOnline();
  }, [isOpen]);

  // Counters stream only for the owner.
  useEffect(() => {
    if (!unlocked) return;
    const unsubAnalytics = subscribeAnalytics(setStats);
    return () => unsubAnalytics();
  }, [unlocked]);

  /** Two-tap counter wipe (first tap arms, second executes). */
  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    await resetQuestions();
    setResetting(false);
    setConfirmReset(false);
  };

  /** No early return on purpose: AnimatePresence needs the tree mounted
   * to play the exit animation. */
  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] w-full max-w-lg overflow-hidden"
          >
            <div className="px-5 pt-5 pb-4 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-yellow-400/12 border border-yellow-400/25 flex items-center justify-center">
                  <BarChart3 className="w-[18px] h-[18px] text-yellow-300" />
                </div>
                <h3 className="text-lg font-black text-white tracking-tight">אנליטיקס</h3>
              </div>
              <button
                onClick={onClose}
                aria-label="סגור"
                className="p-2 rounded-full bg-white/[0.05] text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {!unlocked ? (
                <LockGate onClose={onClose} />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <StatTile icon={<MessageSquareText className="w-5 h-5" />} tint="gold" label="שאלות שנשאלו" value={stats?.totalQuestions ?? '—'} />
                    <StatTile icon={<Users className="w-5 h-5" />} tint="blue" label="משתמשים רשומים" value={stats?.registeredUsers ?? '—'} />
                    <StatTile icon={<Activity className="w-5 h-5" />} tint="green" label="מחוברים עכשיו" value={onlineUsers} />
                    <StatTile
                      icon={<UserCheck className="w-5 h-5" />}
                      tint="violet"
                      label="ממוצע למשתמש"
                      value={stats ? stats.avgPerUser.toFixed(1) : '—'}
                      sub={stats ? `מתוך ${stats.activeUsers} פעילים` : undefined}
                    />
                  </div>
                  <div className="flex gap-2.5">
                    <ActionButton tone="green" onClick={() => setShowFeedbackAdmin(true)}>
                      <MessageSquareHeart className="w-4 h-4" />
                      פידבקים
                    </ActionButton>
                    <ActionButton tone="red" onClick={handleReset} disabled={resetting}>
                      <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
                      {confirmReset ? 'לחצו שוב לאישור' : 'איפוס ספירה'}
                    </ActionButton>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <FeedbackAdminModal isOpen={showFeedbackAdmin} onClose={() => setShowFeedbackAdmin(false)} />
    </>
  );
}
