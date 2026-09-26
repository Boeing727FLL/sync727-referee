/** Lightweight public landing route. No Firebase or analytics imports. */
import { Suspense, lazy, useState } from 'react';
import V12Landing from '../features/v12/V12Landing';
import { LanguageProvider } from '../hooks/useLanguage';

/**
 * One continuous surface: intro -> (login) -> disclaimer -> entrance ->
 * chat. Login, the disclaimer and the referee app itself are lazy stages
 * revealed in-page, so every handoff is a fold/reveal, never a route
 * change. The landing's first paint carries none of them.
 */
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


type Stage = 'landing' | 'entering' | 'chat';

function LandingContent() {
  const [stage, setStage] = useState<Stage>('landing');
  // Remount key + start point for the landing (logout -> intro, kicked -> login).
  const [landing, setLanding] = useState(() => ({
    key: 0,
    start: (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('login') ? 'login' : 'intro') as 'intro' | 'login',
  }));
  const [signedIn, setSignedIn] = useState(hasSavedSession);
  const [chatMounted, setChatMounted] = useState(false);

  // The chat mounts hidden behind the disclaimer so it is live and settled
  // before the card lifts off - no loading screen between them.
  const mountChat = () => {
    void refereeImport();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('login')) {
      window.history.replaceState({}, '', '/');
    }
    setChatMounted(true);
  };

  const chatLive = stage === 'entering' || stage === 'chat';
  return (
    <div data-stage={stage}>
      {stage !== 'chat' && (
        <V12Landing
          key={landing.key}
          signedIn={signedIn}
          start={landing.start}
          
          onAuthed={mountChat}
          onConfirm={() => setStage('entering')}
          onDone={() => setStage('chat')}
        />
      )}
      {chatMounted && (
        <div className={chatLive ? 'chat-stage chat-stage-live' : 'chat-stage'} aria-hidden={!chatLive}>
          <Suspense fallback={null}>
            <EmbeddedReferee onNavigateOut={(to) => {
              setSignedIn(hasSavedSession());
              setChatMounted(false);
              setLanding(l => ({ key: l.key + 1, start: to === '/login' ? 'login' : 'intro' }));
              setStage('landing');
            }} />
          </Suspense>
        </div>
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
      <LandingContent />
    </LanguageProvider>
  );
}
