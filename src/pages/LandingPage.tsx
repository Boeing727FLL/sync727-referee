/** Lightweight public landing route. No Firebase or analytics imports. */
import { Suspense, lazy, useEffect, useState } from 'react';
import IntroScreen from '../components/IntroScreen';
import ParticleBurst from '../components/ParticleBurst';
import { LandingLanguageProvider, useLandingLanguage } from '../features/landing/language';
import { LanguageProvider } from '../hooks/useLanguage';

/**
 * One continuous surface: intro -> (login) -> disclaimer -> entrance ->
 * chat. Login, the disclaimer and the referee app itself are lazy stages
 * revealed in-page, so every handoff is a fold/reveal, never a route
 * change. The landing's first paint carries none of them.
 */
const loginStageImport = () => import('../features/landing/LoginStage');
const LoginStage = lazy(loginStageImport);
const disclaimerStageImport = () => import('../features/landing/DisclaimerStage');
const DisclaimerStage = lazy(disclaimerStageImport);
const refereeImport = () => import('../features/landing/EmbeddedReferee');
const EmbeddedReferee = lazy(refereeImport);

export function hasSavedSession() {
  try {
    return Boolean(
      localStorage.getItem('auth_user') ||
      localStorage.getItem('google_access_token') ||
      localStorage.getItem('firebase:authUser:') ||
      Object.keys(localStorage).some(key => key.startsWith('firebase:authUser:'))
    );
  } catch {
    return false;
  }
}

type Stage = 'intro' | 'login' | 'disclaimer' | 'entering' | 'chat';

/** How long the entrance choreography runs before the chat is fully live. */
const ENTERING_MS = 2600;

function LandingContent() {
  const { t } = useLandingLanguage();
  const signedIn = hasSavedSession();
  const [stage, setStage] = useState<Stage>(
    () => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('login') ? 'login' : 'intro'),
  );

  useEffect(() => {
    if (stage !== 'entering') return;
    const id = setTimeout(() => setStage('chat'), ENTERING_MS);
    return () => clearTimeout(id);
  }, [stage]);

  // Both entry paths converge here: a fresh login (LoginStage onSuccess)
  // and a signed-in CTA press. The disclaimer always comes before the chat
  // entrance, and the app chunk starts downloading immediately.
  const beginEntry = () => {
    void refereeImport();
    // Decode the chat backdrop's glow fields now, during the gate, instead
    // of on the main thread in the middle of the entrance animation.
    if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
      const imgA = new Image(); imgA.src = '/chat-glow.jpg';
      const imgB = new Image(); imgB.src = '/chat-glow-tall.jpg';
    }
    // Deep-link param consumed: a reload from here on lands on the intro.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('login')) {
      window.history.replaceState({}, '', '/');
    }
    setStage('disclaimer');
  };

  const chatLive = stage === 'entering' || stage === 'chat';

  // Particle handoff: confirming the gate bursts the disclaimer's own
  // elements into blue/red embers (the chat backdrop's energy colors) on a
  // canvas ABOVE the exiting stage and the entering chat. Reduced motion
  // skips the burst and goes straight to the entrance.
  const [entryBurst, setEntryBurst] = useState(false);
  const [burstSeeds, setBurstSeeds] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  const confirmDisclaimer = () => {
    const reduce = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Snapshot the disclaimer's element geometry NOW, before its exit
    // animation moves anything - the burst's spawn points stay truthful
    // even though the burst itself starts a beat later.
    const seeds = Array.from(document.querySelectorAll<HTMLElement>('[data-burst]'))
      .map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })
      .filter((r) => r.width > 0 && r.height > 0);
    setBurstSeeds(seeds);
    setStage('entering');
    // Let the chat chunk mount behind the exiting gate first; the burst
    // starts on a clean frame instead of competing with the mount long-task.
    if (!reduce) window.setTimeout(() => setEntryBurst(true), 200);
  };

  return (
    <div data-stage={stage}>
      {(stage === 'intro' || stage === 'login' || stage === 'disclaimer') && (
        <IntroScreen
          isLoggedIn={signedIn}
          mode={stage === 'intro' ? 'intro' : stage === 'login' ? 'login' : 'disclaimer'}
          onContinue={() => (signedIn ? beginEntry() : setStage('login'))}
          onWarm={() => void (signedIn ? refereeImport() : loginStageImport())}
          t={t}
        />
      )}
      {!signedIn && (stage === 'login' || stage === 'disclaimer') && (
        <div className={stage === 'login' ? undefined : 'login-stage-out'}>
          <Suspense fallback={null}>
            <LoginStage onBack={() => setStage('intro')} onSuccess={beginEntry} />
          </Suspense>
        </div>
      )}
      {(stage === 'disclaimer' || chatLive) && (
        <>
          {/* The app mounts hidden behind the disclaimer so it is live and
              settled before the entrance reveals it. */}
          <div className={chatLive ? 'chat-stage chat-stage-live' : 'chat-stage'} aria-hidden={!chatLive}>
            <Suspense fallback={null}>
              <EmbeddedReferee onNavigateOut={(to) => setStage(to === '/login' ? 'login' : 'intro')} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <DisclaimerStage isOpen={stage === 'disclaimer'} onConfirm={confirmDisclaimer} handoff />
          </Suspense>
          {stage === 'entering' && <div className="enter-bloom" aria-hidden />}
          {entryBurst && <ParticleBurst seeds={burstSeeds} onDone={() => setEntryBurst(false)} />}
        </>
      )}
    </div>
  );
}

export default function LandingPage() {
  // IntroScreen reads direction from the app-wide language context, so the
  // landing route must provide it too (it normally lives only inside
  // RefereeApp). The locales are already in this chunk via IntroScreen's
  // own useLanguage import, so this adds no bundle weight.
  return (
    <LanguageProvider>
      <LandingLanguageProvider><LandingContent /></LandingLanguageProvider>
    </LanguageProvider>
  );
}
