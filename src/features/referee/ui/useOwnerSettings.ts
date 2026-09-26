/**
 * useOwnerSettings - the owner control room's state and actions: the live
 * maintenance flag, the two-tap work-mode toggle (enabling locks everyone
 * out), the two-tap question-counter wipe, and the global feedback-timer
 * reset. The modal stays a routing hub; all timer handling is tracked so
 * nothing fires into an unmounted tree.
 */
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../../hooks/useLanguage';
import { resetQuestions } from '../../../lib/analytics';
import { subscribeMaintenance, setMaintenance, resetFeedbackForAll } from '../../../lib/refereeFlags';
import { isCurrentUserOwner } from '../../../lib/owner';

/** How long a second confirming tap stays armed. */
const CONFIRM_WINDOW_MS = 5000;

/** How long the feedback-timer confirmation message stays visible. */
const FB_MSG_MS = 5000;

export default function useOwnerSettings(isOpen: boolean) {
  const { t } = useLanguage();
  const [owner] = useState(() => isCurrentUserOwner());
  const [maintenance, setMaintenanceState] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmWorkMode, setConfirmWorkMode] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fbMsg, setFbMsg] = useState<string | null>(null);
  const [fbWorking, setFbWorking] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // Every pending timer is tracked and cancelled on unmount/close, so a
  // confirm window or message clear never fires into a dead tree.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Fresh confirmations on every opening; maintenance stays live-subscribed.
  useEffect(() => {
    if (!isOpen) {
      setConfirmWorkMode(false);
      setConfirmReset(false);
      setFbMsg(null);
      setToggleError(null);
      setResetMsg(null);
      return;
    }
    return subscribeMaintenance(setMaintenanceState);
  }, [isOpen]);

  /** Work-mode toggle: enabling needs a second tap (it locks everyone out). */
  const handleWorkModeToggle = async () => {
    if (toggling) return;
    if (!maintenance && !confirmWorkMode) {
      setConfirmWorkMode(true);
      later(() => setConfirmWorkMode(false), CONFIRM_WINDOW_MS);
      return;
    }
    setConfirmWorkMode(false);
    setToggleError(null);
    setToggling(true);
    try {
      await setMaintenance(!maintenance);
    } catch (e: any) {
      console.warn('setMaintenance failed:', e);
      setToggleError(t('owner.workFail'));
    }
    setToggling(false);
  };

  /** Two-tap wipe of the question counters, with an honest outcome line. */
  const handleResetQuestions = async () => {
    if (resetting) return;
    if (!confirmReset) {
      setConfirmReset(true);
      later(() => setConfirmReset(false), CONFIRM_WINDOW_MS);
      return;
    }
    setConfirmReset(false);
    setResetting(true);
    setResetMsg(null);
    const ok = await resetQuestions();
    setResetting(false);
    setResetMsg(ok ? t('owner.resetDone') : t('owner.resetFail'));
    later(() => setResetMsg(null), FB_MSG_MS);
  };

  /** Global feedback-timer reset (server flag every client obeys) + local keys. */
  const handleResetFeedbackTimer = async () => {
    if (fbWorking) return;
    setFbWorking(true);
    try {
      await resetFeedbackForAll();
      setFbMsg(t('owner.feedbackTimerDone'));
    } catch (e) {
      console.warn('resetFeedbackForAll failed:', e);
      setFbMsg(t('owner.resetFail'));
    }
    setFbWorking(false);
    later(() => setFbMsg(null), FB_MSG_MS);
  };

  return {
    owner, maintenance,
    toggling, confirmWorkMode, toggleError, handleWorkModeToggle,
    confirmReset, resetting, resetMsg, handleResetQuestions,
    fbMsg, fbWorking, handleResetFeedbackTimer,
  };
}
