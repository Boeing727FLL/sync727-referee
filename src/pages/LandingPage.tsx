/** Lightweight public landing route. No Firebase or analytics imports. */
import { Suspense, lazy, useEffect, useState } from 'react';
import IntroScreen from '../components/IntroScreen';
import LoginOrbitExit, { type OrbitSeed } from '../features/landing/LoginOrbitExit';
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


/**
 * Snapshot the login form's orbit rows (geometry + a short label each) at
 * the moment of success - the ghost tiles lift off from exactly where the
 * real rows stood, like the disclaimer's own burst seeds. Empty under
 * reduced motion: the gate then opens directly, as before.
 */
function collectOrbitSeeds(): OrbitSeed[] {
  if (typeof window === 'undefined') return [];
  const reduce = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return [];
  return Array.from(document.querySelectorAll<HTMLElement>('[data-orbit]'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      const input = el.querySelector('input');
      let label = '';
      if (input) {
        label = input.type === 'password'
          ? '\u2022'.repeat(Math.max(input.value.length, 8))
          : (input.value || input.placeholder || '');
      } else {
        const span = el.querySelector('button span, span');
        label = (span?.textContent ?? el.textContent ?? '').trim();
      }
      return { left: r.left, top: r.top, width: r.width, height: r.height, label: label.slice(0, 32) };
    })
    .filter((s) => s.width > 0 && s.height > 0 && s.label.length > 0);
}

type Stage = 'intro' | 'login' | 'disclaimer' | 'entering' | 'chat';

/** How long the entrance choreography runs before the chat is fully live. */
const ENTERING_MS = 2600;

function LandingContent() {
  const { t } = useLandingLanguage();
  const signedIn = hasSavedSession();
  const [orbitSeeds, setOrbitSeeds] = useState<OrbitSeed[] | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  // Failed login: the same orbit plays in red and the form comes back.
  const [failSeeds, setFailSeeds] = useState<OrbitSeed[] | null>(null);
  const reduceMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const handleLoginFailure = () => {
    const seeds = collectOrbitSeeds();
    if (seeds.length >= 3) setFailSeeds(seeds);
  };
  const [stage, setStage] = useState<Stage>(
    () => (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).has('login') || new URLSearchParams(window.location.search).has('orbit-demo')) ? 'login' : 'intro'),
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
      // Only the orientation the backdrop will actually show (md splits at
      // 768px) - on a phone this halves the decode work before the entrance.
      const wide = window.matchMedia('(min-width: 768px)').matches;
      const img = new Image(); img.src = wide ? '/chat-glow.webp' : '/chat-glow-tall.webp';
    }
    // Deep-link param consumed: a reload from here on lands on the intro.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('login')) {
      window.history.replaceState({}, '', '/');
    }
    const seeds = collectOrbitSeeds();
    const orbit = seeds.length >= 3;
    setOrbitSeeds(orbit ? seeds : null);
    setGateOpen(!orbit);
    setStage('disclaimer');
  };

  // Preview hook: ?orbit-demo renders the login stage and plays the success
  // handoff once, so the choreography can be reviewed without credentials.
  const orbitDemo = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('orbit-demo');
  useEffect(() => {
    if (!orbitDemo || stage !== 'login') return;
    const fail = new URLSearchParams(window.location.search).get('orbit-demo') === 'fail';
    const id = setTimeout(() => { if (fail) { handleLoginFailure(); } else { beginEntry(); } }, 2200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbitDemo, stage]);

  // The orbit owns the gate's timing; if it ever can't report, open anyway.
  useEffect(() => {
    if (stage !== 'disclaimer' || gateOpen) return;
    const id = setTimeout(() => setGateOpen(true), 4000);
    return () => clearTimeout(id);
  }, [stage, gateOpen]);

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
          onContinue={() => {
            if (signedIn) { beginEntry(); return; }
            void loginStageImport();
            void disclaimerStageImport();
            setStage('login');
          }}
          onWarm={() => void (signedIn ? refereeImport() : loginStageImport())}
          t={t}
        />
      )}
      {(stage === 'login' || stage === 'disclaimer') && (
        <div className={stage === 'login' ? (failSeeds ? 'login-stage-cut' : undefined) : orbitSeeds ? 'login-stage-cut' : 'login-stage-out'}>
          <Suspense fallback={null}>
            <LoginStage onBack={() => setStage('intro')} onSuccess={beginEntry} onFailure={reduceMotion ? undefined : handleLoginFailure} />
          </Suspense>
        </div>
      )}
      {orbitSeeds && (
        <LoginOrbitExit
          seeds={orbitSeeds}
          onGate={() => setGateOpen(true)}
          onDone={() => setOrbitSeeds(null)}
        />
      )}
      {failSeeds && (
        <LoginOrbitExit
          seeds={failSeeds}
          variant="fail"
          onDone={() => setFailSeeds(null)}
        />
      )}
      {((stage === 'disclaimer' && gateOpen) || chatLive) && (
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
