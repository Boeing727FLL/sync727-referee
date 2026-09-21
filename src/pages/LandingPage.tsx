/** Lightweight public landing route. No Firebase or analytics imports. */
import { Suspense, lazy, useState } from 'react';
import IntroScreen from '../components/IntroScreen';
import { LandingLanguageProvider, useLandingLanguage } from '../features/landing/language';
import { LanguageProvider } from '../hooks/useLanguage';

/**
 * The login stage (and with it Firebase auth) stays out of the landing's
 * first paint: it is lazy-loaded on the first intent and revealed in-page,
 * so the intro -> login transition is a fold, not a route change.
 */
const loginStageImport = () => import('../features/landing/LoginStage');
const LoginStage = lazy(loginStageImport);

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

interface LandingPageProps {
  onNavigate?: (to: string) => void;
  onWarmRoute?: (to: string) => void;
}

function LandingContent({ onNavigate, onWarmRoute }: LandingPageProps) {
  const { t } = useLandingLanguage();
  const signedIn = hasSavedSession();
  const [stage, setStage] = useState<'intro' | 'login'>(
    () => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('login') ? 'login' : 'intro'),
  );

  const navigate = (to: string) => (onNavigate ?? window.location.assign.bind(window.location))(to);
  const enterChat = () => navigate('/app?enter=chat');

  return (
    <>
      <IntroScreen
        isLoggedIn={signedIn}
        mode={stage}
        onContinue={() => (signedIn ? enterChat() : setStage('login'))}
        onWarm={() => {
          if (signedIn) {
            onWarmRoute?.('/app?enter=chat');
          } else {
            void loginStageImport();
          }
        }}
        t={t}
      />
      {stage === 'login' && !signedIn && (
        <Suspense fallback={null}>
          <LoginStage onBack={() => setStage('intro')} onSuccess={enterChat} />
        </Suspense>
      )}
    </>
  );
}

export default function LandingPage(props: LandingPageProps) {
  // IntroScreen reads direction from the app-wide language context, so the
  // landing route must provide it too (it normally lives only inside
  // RefereeApp). The locales are already in this chunk via IntroScreen's
  // own useLanguage import, so this adds no bundle weight.
  return (
    <LanguageProvider>
      <LandingLanguageProvider><LandingContent {...props} /></LandingLanguageProvider>
    </LanguageProvider>
  );
}
