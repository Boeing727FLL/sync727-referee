/**
 * useAdminAnalytics - the analytics viewer's data: owner gate on every
 * open, online presence streaming regardless, counters streaming only for
 * the owner, and the two-tap counter wipe (first tap arms, second runs).
 */
import { useState, useEffect } from 'react';
import { subscribeAnalytics, resetQuestions, onOnlineUsersChange, type AnalyticsStats } from '../../../lib/analytics';
import { isCurrentUserOwner } from '../../../lib/owner';

export default function useAdminAnalytics(isOpen: boolean) {
  const [unlocked, setUnlocked] = useState(false);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);

  // Fresh gate on every opening; online presence streams regardless.
  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setConfirmReset(false);
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
    if (resetting) return;
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    setResetFailed(false);
    const ok = await resetQuestions();
    setResetting(false);
    setConfirmReset(false);
    if (!ok) setResetFailed(true);
  };


  return {
    unlocked, stats, onlineUsers,
    resetting, confirmReset, resetFailed, handleReset,
  };
}
