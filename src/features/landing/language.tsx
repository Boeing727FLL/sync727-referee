import {createContext, type ReactNode, useContext, useEffect, useState} from 'react';
import {landingTranslations} from './translations';

export type LandingLanguageCode = keyof LandingTranslations;
export type LandingTranslations = Record<string, Record<string, string>>;

type LandingLanguageContextValue = {
  t: (key: string) => string;
};

const supportedLanguages = new Set(Object.keys(landingTranslations));
const LandingLanguageContext = createContext<LandingLanguageContextValue | undefined>(undefined);

function savedLanguage(): LandingLanguageCode {
  try {
    const code = localStorage.getItem('app_language') || 'he';
    return (supportedLanguages.has(code) ? code : 'he') as LandingLanguageCode;
  } catch {
    return 'he';
  }
}

export function LandingLanguageProvider({children}: {children: ReactNode}) {
  const [language] = useState(savedLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string) => landingTranslations[language]?.[key] || landingTranslations.en[key] || key;
  return <LandingLanguageContext.Provider value={{t}}>{children}</LandingLanguageContext.Provider>;
}

export function useLandingLanguage() {
  const context = useContext(LandingLanguageContext);
  if (!context) throw new Error('useLandingLanguage must be used within LandingLanguageProvider');
  return context;
}
