/** Authenticated referee route and its providers. */
import { AuthProvider } from '../hooks/useAuth';
import { LanguageProvider } from '../hooks/useLanguage';
import PublicRulebookAI from './PublicRulebookAI';

export default function RefereeApp() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <PublicRulebookAI />
      </AuthProvider>
    </LanguageProvider>
  );
}
