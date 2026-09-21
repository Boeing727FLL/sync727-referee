import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { TranslationMap } from '../locales/types';
import he from '../locales/he';
import en from '../locales/en';
import ar from '../locales/ar';
import es from '../locales/es';
import fr from '../locales/fr';
import de from '../locales/de';
import ru from '../locales/ru';
import pt from '../locales/pt';
import it from '../locales/it';
import zh from '../locales/zh';
import ja from '../locales/ja';
import ko from '../locales/ko';


export type LanguageCode = 'he' | 'en' | 'ar' | 'es' | 'fr' | 'de' | 'ru' | 'pt' | 'it' | 'zh' | 'ja' | 'ko';

interface Language {
  code: LanguageCode;
  native: string;
  english: string;
}

const languages: Language[] = [
  { code: 'he', native: 'עברית', english: 'Hebrew' },
  { code: 'en', native: 'English', english: 'English' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
  { code: 'zh', native: '中文', english: 'Chinese' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'ko', native: '한국어', english: 'Korean' },
];

type TranslationsDict = Record<LanguageCode, TranslationMap>;


const translations: TranslationsDict = { he, en, ar, es, fr, de, ru, pt, it, zh, ja, ko };

const rtlLanguages: LanguageCode[] = ['he', 'ar'];

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string) => string;
  currentLang: Language;
  languages: Language[];
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    try { return (localStorage.getItem('app_language') as LanguageCode) || 'he'; }
    catch { return 'he'; }
  });

  const setLanguage = (code: LanguageCode) => {
    setLanguageState(code);
    localStorage.setItem('app_language', code);
    document.documentElement.lang = code;
    document.documentElement.dir = rtlLanguages.includes(code) ? 'rtl' : 'ltr';
  };

  useEffect(() => {
    document.documentElement.lang = language;
    // Layout direction follows the language: Hebrew/Arabic RTL, every
    // other supported language LTR.
    document.documentElement.dir = rtlLanguages.includes(language) ? 'rtl' : 'ltr';
  }, [language]);

  const t = (key: string): string => {
    const lang = language as LanguageCode;
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  const currentLang = languages.find(l => l.code === language) || languages[0];
  const isRTL = rtlLanguages.includes(language);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, currentLang, languages, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
