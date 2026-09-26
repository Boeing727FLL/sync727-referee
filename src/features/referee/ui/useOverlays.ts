/**
 * useOverlays - open/close state for the chat page's floating layers
 * (privacy, terms, settings, logs, feedback, admin tools). No data lives
 * here; each modal gates itself with its flag so the chat tree underneath
 * never unmounts. `maintenance` mirrors the global maintenance gate
 * subscription; it is set through the global setMaintenance action.
 */
import { useEffect, useState } from 'react';
import { subscribeMaintenanceGate } from '../../../lib/refereeFlags';

export default function useOverlays() {
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);
  const [showTerms, setShowTerms] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showSettingsFeedback, setShowSettingsFeedback] = useState<boolean>(false);
  const [maintenance, setMaintenanceState] = useState<boolean>(false);
  useEffect(() => {
    return subscribeMaintenanceGate(setMaintenanceState);
  }, []);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [showAdminAnalytics, setShowAdminAnalytics] = useState<boolean>(false);
  const [showRefereeLogs, setShowRefereeLogs] = useState<boolean>(false);
  const [showJudgeCorrections, setShowJudgeCorrections] = useState<boolean>(false);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);

  return {
    showPrivacy, setShowPrivacy,
    showTerms, setShowTerms,
    showSettings, setShowSettings,
    showSettingsFeedback, setShowSettingsFeedback,
    maintenance,
    showLogoutConfirm, setShowLogoutConfirm,
    showAdminAnalytics, setShowAdminAnalytics,
    showRefereeLogs, setShowRefereeLogs,
    showJudgeCorrections, setShowJudgeCorrections,
    showFeedback, setShowFeedback,
  };
}
