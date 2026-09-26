/** Optional screens are split so closed admin tools never join the critical path. */
import { lazy } from 'react';

export const AdminAnalyticsModal = lazy(() => import('./AdminAnalyticsModal'));
export const RefereeLogsModal = lazy(() => import('./RefereeLogsModal'));
export const JudgeCorrectionsModal = lazy(() => import('./JudgeCorrectionsModal'));
export const FeedbackModal = lazy(() => import('./FeedbackModal'));
export const PrivacyModal = lazy(() => import('./PrivacyModal'));
export const SettingsModal = lazy(() => import('./SettingsModal'));
export const MaintenanceScreen = lazy(() => import('./MaintenanceScreen'));
export const FeedbackAdminModal = lazy(() => import('./FeedbackAdminModal'));
export const MarkdownMessage = lazy(() => import('./MarkdownMessage'));
