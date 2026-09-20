/** Lightweight public landing route. No Firebase or analytics imports. */
import { useNavigate } from 'react-router-dom';
import IntroScreen from '../components/IntroScreen';
import { LanguageProvider, useLanguage } from '../hooks/useLanguage';

function hasSavedSession() {
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

function LandingContent() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const signedIn = hasSavedSession();

  return (
    <IntroScreen
      isLoggedIn={signedIn}
      onContinue={() => navigate(signedIn ? '/app?enter=chat' : '/login')}
      t={t}
    />
  );
}

export default function LandingPage() {
  return <LanguageProvider><LandingContent /></LanguageProvider>;
}
