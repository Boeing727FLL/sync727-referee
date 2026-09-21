/**
 * Locale registry - single import point for every shipped dictionary.
 *
 * useLanguage.tsx serves React components; translateFor serves non-React
 * modules (ErrorBoundary, model-service fallbacks) that only know the
 * user's language code. Both read the SAME dictionaries, so parity tests
 * over this registry cover every consumer.
 */
import type { TranslationMap } from './types';
import he from './he';
import en from './en';
import ar from './ar';
import es from './es';
import fr from './fr';
import de from './de';
import ru from './ru';
import pt from './pt';
import it from './it';
import zh from './zh';
import ja from './ja';
import ko from './ko';

export type LanguageCode = 'he' | 'en' | 'ar' | 'es' | 'fr' | 'de' | 'ru' | 'pt' | 'it' | 'zh' | 'ja' | 'ko';

export const translations: Record<LanguageCode, TranslationMap> = { he, en, ar, es, fr, de, ru, pt, it, zh, ja, ko };

/** Translate without React: given language wins, then English, then Hebrew. */
export function translateFor(language: string, key: string): string {
  return translations[language as LanguageCode]?.[key] || translations.en[key] || translations.he[key] || key;
}
