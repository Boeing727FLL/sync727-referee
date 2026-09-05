import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, BarChart3, MessageSquareText, Users, Activity, RotateCcw, UserCheck, MessageSquareHeart } from 'lucide-react';
import { subscribeAnalytics, resetQuestions, onOnlineUsersChange, type AnalyticsStats } from '../lib/analytics';
import { isCurrentUserOwner } from '../lib/owner';
import FeedbackAdminModal from './FeedbackAdminModal';

interface AdminAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminAnalyticsModal({ isOpen, onClose }: AdminAnalyticsModalProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showFeedbackAdmin, setShowFeedbackAdmin] = useState(false);

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

  useEffect(() => {
    if (!unlocked) return;
    const unsubAnalytics = subscribeAnalytics(setStats);
    return () => unsubAnalytics();
  }, [unlocked]);

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

  const openFeedbackAdmin = () => {
    setShowFeedbackAdmin(true);
  };

  const statCard = (icon: React.ReactNode, label: string, value: string | number, sub?: string) => (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] md:text-xs text-slate-400 font-semibold mb-1">{label}</div>
        <div className="text-xl md:text-2xl font-black text-white">{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );

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
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-black text-white">אנליטיקס</h3>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {!unlocked ? (
                <div className="space-y-4">
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                      <Lock className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-400 text-sm">האנליטיקס פתוח לחשבון הבעלים בלבד. התחברו עם החשבון המתאים כדי להמשיך.</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-full py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-black transition-colors"
                  >
                    סגור
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {statCard(<MessageSquareText className="w-5 h-5" />, 'שאלות שנשאלו', stats?.totalQuestions ?? '—')}
                    {statCard(<Users className="w-5 h-5" />, 'משתמשים רשומים', stats?.registeredUsers ?? '—')}
                    {statCard(<Activity className="w-5 h-5" />, 'משתמשים מחוברים עכשיו', onlineUsers)}
                    {statCard(<UserCheck className="w-5 h-5" />, 'ממוצע שאלות למשתמש', stats ? stats.avgPerUser.toFixed(1) : '—', stats ? `מתוך ${stats.activeUsers} משתמשים פעילים` : undefined)}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={openFeedbackAdmin}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold hover:bg-emerald-500/30 transition-colors"
                    >
                      <MessageSquareHeart className="w-4 h-4" />
                      צפייה בפידבקים
                    </button>
                    <button
                      onClick={handleReset}
                      disabled={resetting}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
                      {confirmReset ? 'לחצו שוב לאישור האיפוס' : 'אפס את ספירת השאלות'}
                    </button>
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
