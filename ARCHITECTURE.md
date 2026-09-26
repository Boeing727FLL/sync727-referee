# Virtual Referee architecture

This guide explains where behavior lives and what must stay off the startup path.

## Request flow

1. `index.html` loads the small browser entry in `src/main-app.tsx`, which mounts `src/App.tsx` and removes stale service workers (this app is online-only).
2. `src/App.tsx` is a route shell. Any path the router does not own (`/`, `/index.html`, stray paths) renders `src/pages/LandingPage.tsx` with only language state; it deliberately does not initialize Firebase, the router, or app code.
3. Router paths (`src/routePaths.ts`) lazy-load through `src/lib/lazyWithReload.ts`:
   - `/app` -> `src/pages/RefereeApp.tsx`, which installs language/auth providers around `src/pages/PublicRulebookAI.tsx`, the referee screen coordinator.
   - `/login` -> `src/pages/LoginPage.tsx` (standalone sign-in for direct links).
   - `/privacy` and `/terms` -> `src/pages/PrivacyPage.tsx`.
4. The landing page itself is one continuous surface: intro -> login -> disclaimer -> chat, built from `src/features/v12/` (V12Landing, V12AuthForm, Referee character, glyphs, v12.css) with the referee app embedded lazily via `src/features/landing/EmbeddedReferee.tsx`.
5. A submitted question dynamically loads `src/services/geminiService.ts`, which reads the active rulebook pages and streams the Gemini answer.
6. PDF conversion (`mupdf`, including its WASM file), R2's S3 SDK, Markdown rendering and admin modals load only when that feature is used.

## Modules by responsibility

- `src/pages/PublicRulebookAI.tsx`: referee screen coordinator; owns shared live state for chat, entry gates, upload and account overlays.
- `src/features/referee/`: pure rules and browser concerns extracted from the coordinator:
  - `types.ts`, `config.ts`: contracts and product timing/UI constants.
  - `chat/`: request machine, send guards, stop/refund, rate limit, typewriter, attachments, history, text sanitizing, error wording.
  - `ai/`: model chain, retry/cooldown policy, request plan, file plan, answer contract, conversation shaping.
  - `rulebook/`: season parsing, completeness checks, load barrier, PDF rendering, active file selection.
  - `season/`: automatic season identity (colors/icon) via Gemini.
  - `session/`: entry flow, local session evidence, account deletion.
  - `logs/`, `feedback/`, `corrections/`: journal, feedback and referee-corrections models and views.
  - `ui/`: lazy component registry, backdrop, motion helpers, toasts, version check/reload.
- `src/services/geminiService.ts` + `geminiPrompts.ts`: AI request, corrections and rulebook/PDF processing.
- `src/lib/firebase/{app,auth,firestore,rtdb}.ts`: the one Firebase app and service singletons.
- `src/lib/analytics.ts`: presence, usage counters, logs and maintenance flags.
- `src/lib/chatQuota.ts` + `chatQuotaCore.ts`: server-enforced daily chat quota; pure policy split from the Firestore adapter.
- `src/lib/keyVault.ts`: Gemini key pool stored in Firebase.
- `src/lib/r2Config.ts`: public R2 URL helpers safe for the lightweight path.
- `src/lib/r2.ts`: privileged R2 listing/upload/delete client. Import dynamically, never from an entry module.
- `src/hooks/useAuth.tsx`, `src/hooks/useLanguage.tsx`: Firebase identity and locale state.
- `src/locales/`: the canonical 12-language string registry. `src/features/landing/language.tsx` + `translations.ts` project a landing-only subset from that registry; never a second dictionary.
- `src/legal/`: terms/privacy copy (`copy.ts`) and acceptance tracking (`termsAcceptance.ts`).
- `src/components/*Modal.tsx`, `TermsGate.tsx`, `IntroScreen.tsx`, `MaintenanceScreen.tsx`, `ErrorBoundary.tsx`: optional screens, lazy-loaded where possible.

## Performance rules

- Do not add static imports of AI, PDF, AWS/R2 or admin modules to `App.tsx`, `main-app.tsx` or the top of `PublicRulebookAI.tsx`.
- Keep route screens behind lazy imports. Keep Firebase imports out of `LandingPage`, `IntroScreen`, and the shared route shell.
- The landing route uses small responsive backgrounds and WebP logos with explicit dimensions. Its motion choreography (timing, delays, transforms, fades, blur, glass, shadows) is deliberate; performance work must not remove it.
- Hash-named `/assets/*` and self-hosted fonts are immutable; HTML and `version.json` are never cached (see `public/_headers`).
- Do not add a service worker without an explicit offline/update design. The entry removes stale workers left by older releases.
- Measure both raw and gzip bundle sizes with `npm run build` before merging.

## Data and security boundaries

Firebase security rules remain the authority for user, quota, logs and app configuration data (`firestore.rules`, `database.rules.json`, `storage.rules`). Owner-only controls are UI convenience, not an authorization boundary. The question journal is readable by the owner and whoever enters its access code.

The current R2 S3 credential is embedded in the browser-side client by the owner's explicit decision. Moving uploads/list/delete behind a server-side function and rotating that credential remains the known, accepted debt.

## Safe change checklist

1. `npm ci --ignore-scripts`
2. `npm run lint` (type check)
3. `npm test` (node --test suite in `tests/`)
4. `npm run build`
5. Check `/`, `/login` and `/privacy` at phone and desktop sizes.
6. Check sign-in, a question/answer, stop, image attachment and owner-only rulebook tools with authorized test accounts.
7. Confirm no secret, generated `dist/`, environment file or deploy action is included in the commit.
