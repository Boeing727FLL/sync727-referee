/** Optional screens are split so closed admin tools never join the critical path. */
import { lazy } from 'react';

export const AdminAnalyticsModal = lazy(() => import('../../../components/AdminAnalyticsModal'));
export const RefereeLogsModal = lazy(() => import('../../../components/RefereeLogsModal'));
export const JudgeCorrectionsModal = lazy(() => import('../../../components/JudgeCorrectionsModal'));
export const FeedbackModal = lazy(() => import('../../../components/FeedbackModal'));
export const PrivacyModal = lazy(() => import('../../../components/PrivacyModal'));
export const SettingsModal = lazy(() => import('../../../components/SettingsModal'));
export const MaintenanceScreen = lazy(() => import('../../../components/MaintenanceScreen'));
export const FeedbackAdminModal = lazy(() => import('../../../components/FeedbackAdminModal'));
export const TeamWorkspaceModal = lazy(() => import('../../../components/TeamWorkspaceModal'));
export const MarkdownMessage = lazy(() => import('../../../components/MarkdownMessage'));
