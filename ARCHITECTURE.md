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
