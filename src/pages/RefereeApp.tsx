/** Authenticated referee route and its providers. */
import { AuthProvider } from '../hooks/useAuth';
import { LanguageProvider } from '../hooks/useLanguage';
import PublicRulebookAI from './PublicRulebookAI';

export default function RefereeApp({ entryStart, onNavigateOut }: { entryStart?: 'chat'; onNavigateOut?: (to: string) => void } = {}) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <PublicRulebookAI entryStart={entryStart} onNavigateOut={onNavigateOut} />
      </AuthProvider>
    </LanguageProvider>
  );
}
