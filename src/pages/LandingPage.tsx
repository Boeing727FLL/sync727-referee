/** Lightweight public landing route. No Firebase or analytics imports. */
import IntroScreen from '../components/IntroScreen';
import { LandingLanguageProvider, useLandingLanguage } from '../features/landing/language';

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

  return (
    <IntroScreen
      isLoggedIn={signedIn}
      onContinue={() => (onNavigate ?? window.location.assign.bind(window.location))(signedIn ? '/app?enter=chat' : '/login')}
      onWarm={() => onWarmRoute?.(signedIn ? '/app?enter=chat' : '/login')}
      t={t}
    />
  );
}

export default function LandingPage(props: LandingPageProps) {
  return <LandingLanguageProvider><LandingContent {...props} /></LandingLanguageProvider>;
}
