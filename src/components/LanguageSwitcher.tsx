import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';

export default function LanguageSwitcher() {
  const { language, setLanguage, languages, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 md:p-2 bg-white text-slate-900 border-2 border-slate-950 hover:bg-yellow-400 rounded-lg transition-all shadow-[1px_1px_0px_rgba(0,0,0,1)] active:scale-95 cursor-pointer"
        title={t('app.title')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 md:w-5 md:h-5">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border-2 border-slate-950 rounded-xl shadow-[3px_3px_0px_rgba(0,0,0,1)] overflow-hidden min-w-[160px]">
          <div className="max-h-64 overflow-y-auto">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { setLanguage(lang.code); setOpen(false); }}
                className={`w-full text-right px-3 py-2 text-xs md:text-sm font-black flex items-center gap-2 transition-colors cursor-pointer hover:bg-yellow-100 ${
                  language === lang.code ? 'bg-yellow-200 text-slate-950' : 'text-slate-700'
                }`}
              >
                <span className="text-base">{lang.code === 'he' ? '🇮🇱' : lang.code === 'en' ? '🇬🇧' : lang.code === 'ar' ? '🇸🇦' : ''}</span>
                <span>{lang.native}</span>
                <span className="text-[10px] text-slate-400 font-medium">({lang.english})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
