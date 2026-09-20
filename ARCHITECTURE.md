# Virtual Referee architecture

This guide explains where behavior lives and what must stay off the startup path.

## Request flow

1. `index.html` loads the small browser entry in `src/main-app.tsx`.
2. `src/App.tsx` lazy-loads a route. `/` renders `LandingPage` with only language state; it deliberately does not initialize Firebase.
3. `/app` renders `RefereeApp`, which installs language/auth providers, then `PublicRulebookAI` owns the referee screen and coordinates chat, entry gates, session state and optional tools.
4. A submitted question dynamically loads `src/services/geminiService.ts`. That service reads the active rulebook pages and streams the Gemini answer.
5. PDF conversion (`mupdf`, including its 10 MB WASM file), R2's S3 SDK, Markdown rendering and admin modals are loaded only when that feature is used.

## Modules by responsibility

- `src/hooks/useAuth.tsx`: Firebase identity and sign-in state.
- `src/hooks/useLanguage.tsx`: locale state and UI strings.
- `src/lib/firebase.ts`: the one Firebase app and service singletons.
- `src/lib/analytics.ts`: presence, usage counters, logs and maintenance flags.
- `src/lib/chatQuota.ts`: server-enforced chat quota transaction.
- `src/lib/r2Config.ts`: public R2 URL helpers safe for the lightweight path.
- `src/lib/r2.ts`: privileged R2 listing/upload/delete client. Import dynamically, never from an entry module.
- `src/services/geminiService.ts`: AI request, corrections and rulebook/PDF processing.
- `src/services/teamWorkspaceService.ts`: shared team history.
- `src/components/*Modal.tsx`: optional screens, lazy-loaded from the referee page.

## Performance rules

- Do not add static imports of AI, PDF, AWS/R2 or admin modules to `App.tsx`, `main-app.tsx` or the top of `PublicRulebookAI.tsx`.
- Keep route screens behind `React.lazy`. Keep Firebase imports out of `LandingPage`, `IntroScreen`, and the shared route shell.
- The landing route uses 40 KB/107 KB responsive backgrounds and 6 KB/3 KB WebP logos with explicit dimensions. Its original Framer Motion timing, delays, transforms, opacity fades, blur, glass and shadows are preserved; performance work must not remove that choreography.
- Hash-named `/assets/*` and self-hosted fonts are immutable; HTML and `version.json` are never cached.
- Do not add a service worker without an explicit offline/update design. The entry removes stale workers left by older releases.
- Measure both raw and gzip bundle sizes with `npm run build` before merging.

## Data and security boundaries

Firebase security rules remain the authority for user, quota, logs and app configuration data. App Check attests Firebase clients. Owner-only controls are UI convenience, not an authorization boundary.

The current R2 S3 credential is embedded in the historical client implementation. Moving uploads/list/delete behind a server-side function and rotating that credential is required to make R2 administration truly private. This refactor does not rotate credentials or change production infrastructure.

## Safe change checklist

1. `npm ci --ignore-scripts`
2. `npm run lint`
3. `npm run build`
4. Check `/`, `/login` and `/privacy` at phone and desktop sizes.
5. Check sign-in, a question/answer, stop, image attachment and owner-only rulebook tools with authorized test accounts.
6. Confirm no secret, generated `dist/`, environment file or deploy action is included in the commit.

## Referee feature modules

`src/pages/PublicRulebookAI.tsx` remains the screen coordinator because chat, upload and account overlays share live state. Pure rules and browser concerns live under `src/features/referee/`:

- `types.ts`: chat, attachment, rulebook and device contracts.
- `config.ts`: one auditable home for product timing and UI constants.
- `chat/clientRateLimit.ts`: local fast anti-spam guard and Stop refund. Firestore quota stays authoritative.
- `chat/text.ts`: strips private model-reasoning blocks before display/logging.
- `rulebook/season.ts`: deterministic filename-to-season parsing.
- `session/storage.ts`: offline session evidence and local trace cleanup, never authorization.
- `ui/lazyComponents.ts`: code-split optional/admin surfaces.
- `ui/useTransientToast.ts`, `ui/useDeviceType.ts`, `ui/browser.ts`: small reusable browser/UI concerns.

The coordinator intentionally retains operations that mutate several domains in one transaction, such as account deletion and rulebook replacement. Splitting those into prop-heavy components would hide ordering constraints without reducing risk.
- `chat/ChatComposer.tsx`: reply preview, image attachment preview, textarea and send/stop controls. The coordinator owns message/request state and passes explicit actions; the component owns no network or quota behavior.
- `logs/model.ts`: pure journal timestamp normalization and search/date/sort filtering.
- `logs/LogViews.tsx`: journal banners, filter chips, loading/empty states and expandable Q&A rows; Firebase ownership and deletes stay in `RefereeLogsModal`.

## Locales

`src/locales/<code>.ts` keeps one dictionary per language. They are synchronous by design so a saved non-Hebrew language is available on the first render with no fallback-language flash. `useLanguage.tsx` owns only selection, persistence, direction metadata and fallback behavior.
- `feedback/model.ts` and `feedback/FeedbackViews.tsx`: pure feedback statistics/formatting and feedback-card/stat/empty/lock presentation. Firebase ownership and destructive operations stay in `FeedbackAdminModal`.
- `chat/ChatHero.tsx`: empty-chat welcome and starter-question presentation. The coordinator still owns sending, busy state and locale data.
- `rulebook/RulebookDialogs.tsx`: upload progress/picker and typed season-replacement confirmation. R2 operations, season detection and destructive ordering remain in the coordinator.
- `ui/AccountDialogs.tsx`: password confirmation and displaced-session presentation. Reauthentication, Firebase/RTDB cleanup and account deletion ordering remain in the coordinator.
- `chat/messageView.ts`: pure display-state derivation for think blocks, arrow cleanup, typewriter slicing and initial-answer gating. It owns no timer or stream state.
- `chat/ChatMessageRow.tsx`: thinking/user/referee row presentation, attachments, Markdown, copy/reply controls and live-answer glow. The coordinator owns the typewriter target/ref, stream lifecycle and actions.
- `chat/useTypewriter.ts`: the visible-response clock, target ref and rendering completion boundary. Network streaming, stop/abort and request bookkeeping remain in the coordinator.
- `features/auth/AuthProgressOverlay.tsx`: verification/success/departure choreography after login. `LoginPage` retains Firebase auth, signup, password reset, maintenance gating and navigation timing.
- `features/referee/rulebook/pdfRendering.ts`: lazy MuPDF loading, browser PDF-page rendering and Blob-to-base64 conversion. Gemini request/model fallback logic stays in `geminiService`.
- `lib/refereeFlags.ts`: global maintenance and feedback-reset flags, including fail-closed maintenance gating. `analytics.ts` now stays focused on counters, logs, feedback records, presence, sessions and dashboard reads.
