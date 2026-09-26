/**
 * UserMenu - the header avatar button and its portaled glass panel.
 *
 * Owns all of its open/close, sub-page (main -> language) and positioning
 * state; the parent only supplies the user, the language context and the
 * "open this overlay" callbacks. The panel is portaled into the chat stage
 * so the header's backdrop filter cannot make it see-through on iOS.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Trash2, Shield, ChevronLeft, ChevronRight, Globe, ScrollText, Check, Settings, MailCheck, FileText } from 'lucide-react';
import { MENU_ROW_CLASS } from '../config';
import { MOTION } from './motion';
import { legalFor } from '../../../legal/copy';
import { auth } from '../../../lib/firebase/auth';
import type { LanguageCode } from '../../../hooks/useLanguage';

/** Build stamp display: epoch millis read as a short local date-time; anything else passes through. */
function formatBuildVersion(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1e12) return raw == null ? '?' : String(raw);
  try {
    return new Date(n).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(raw);
  }
}

/** Up to two initials, as in the v12 header avatar ("יובל מרגלית" -> "ימ"). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'U') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

type Props = {
  displayUser: { name?: string; email?: string; picture?: string };
  gravatarPic: string;
  isOwner: boolean;
  t: (key: string) => string;
  language: LanguageCode;
  languages: { code: LanguageCode; native: string; english: string }[];
  setLanguage: (code: LanguageCode) => void;
  isRTL: boolean;
  showToast: (message: string) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onSettings: () => void;
  onLogs: () => void;
};

export default function UserMenu({ displayUser, gravatarPic, isOwner, t, language, languages, setLanguage, isRTL, showToast, onLogout, onDeleteAccount, onPrivacy, onTerms, onSettings, onLogs }: Props) {
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  // The menu drills into sub-pages in place (iOS-style), e.g. language.
  const [menuPage, setMenuPage] = useState<'main' | 'lang'>('main');
  useEffect(() => { if (!showUserMenu) setMenuPage('main'); }, [showUserMenu]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuPanelRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 76, left: 12 });
  const langBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuPanelRef.current?.contains(e.target as Node)) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const openLangMenu = () => setMenuPage('lang');

  return (
    <div className="relative" ref={userMenuRef}>
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenuPos({ top: r.bottom + 10, left: Math.max(12, Math.min(r.left, window.innerWidth - 276)) });
          setShowUserMenu((v) => !v);
        }}
        className="flex items-center gap-1.5 min-h-[44px] rounded-full cursor-pointer" aria-label={displayUser.name}
      >
        <span className="v12-av">
          {displayUser.picture || gravatarPic
            ? <img src={displayUser.picture || gravatarPic} alt="" />
            : initialsOf(displayUser.name || 'U')}
        </span>
      </button>
      {createPortal(<AnimatePresence>
        {showUserMenu && <motion.div key="scrim" className="v12-menu-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />}
        {showUserMenu && (
          <motion.div
            key="menu"
            ref={userMenuPanelRef}
            initial={{ opacity: 0, y: -6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={MOTION.overlay}
            className="v12-menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            dir="rtl"
          >
            <AnimatePresence mode="popLayout" initial={false}>
            {menuPage === 'main' ? (
            <motion.div key="main" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={MOTION.overlay}>
            <div className="p-3 bg-white/[0.03] border-b border-white/[0.08] flex items-center gap-3">
              {displayUser.picture || gravatarPic ? (
                <img src={displayUser.picture || gravatarPic} alt="" className="w-10 h-10 rounded-full border-2 border-white/30 object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full border border-white/15 bg-white/10 flex items-center justify-center">
                  <span className="text-sm font-black text-white/80">{(displayUser.name || 'U').trim().charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0 text-start">
                <p className="text-sm font-black text-white truncate">{displayUser.name}</p>
                <p className="text-xs text-white/45 truncate" dir="ltr">
                  {displayUser.email}
                </p>
              </div>
            </div>
            <div className="p-2 space-y-1">
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className={MENU_ROW_CLASS}
              >
                <LogOut className="w-4 h-4 text-white/40" />
                {t('auth.logout')}
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onDeleteAccount();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] text-white/70 hover:text-[#ff7a66] font-bold text-sm transition-colors text-start cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-[#ff7a66]/70" />
                {t('common.deleteAccount')}
              </button>
              <div className="h-px bg-white/[0.08] my-1" />
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onPrivacy();
                }}
                className={MENU_ROW_CLASS}
              >
                <Shield className="w-4 h-4 text-white/40" />
                {t('common.privacy')}
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onTerms();
                }}
                className={MENU_ROW_CLASS}
              >
                <FileText className="w-4 h-4 text-white/40" />
                {legalFor(language).gate.menu}
              </button>
              {isOwner && (
                <button
                  onClick={() => { setShowUserMenu(false); onSettings(); }}
                  className={MENU_ROW_CLASS}
                >
                  <Settings className="w-4 h-4 text-white/40" />
                  {t('common.settings')}
                </button>
              )}
              {auth.currentUser && !auth.currentUser.emailVerified && isOwner && (
                <button
                  onClick={async () => {
                    setShowUserMenu(false);
                    try {
                      const { sendEmailVerification } = await import('firebase/auth');
                      const fbUser = auth.currentUser;
                      if (fbUser) {
                        await sendEmailVerification(fbUser);
                        showToast(t('common.ownerVerificationSent'));
                      }
                    } catch {
                      showToast(t('common.ownerVerificationFailed'));
                    }
                  }}
                  className={MENU_ROW_CLASS}
                >
                  <MailCheck className="w-4 h-4 text-amber-400/80" />
                  <span className="flex-1">{t('common.sendOwnerVerification')}</span>
                </button>
              )}
              <div className="h-px bg-white/[0.08] my-1" />
              <button
                onClick={() => { setShowUserMenu(false); onLogs(); }}
                className={MENU_ROW_CLASS}
              >
                <ScrollText className="w-4 h-4 text-white/40" />
                {t('common.refereeLogs')}
              </button>
              <div className="h-px bg-white/[0.08] my-1" />
              <button
                ref={langBtnRef}
                onClick={openLangMenu}
                className={MENU_ROW_CLASS}
              >
                <Globe className="w-4 h-4 text-white/40" />
                <span className="flex-1">{t('common.language')}</span>
                <span className="text-[11px] text-white/40 font-bold">{languages.find(l => l.code === language)?.native}</span>
                <ChevronLeft className="w-4 h-4 text-white/30" />
              </button>
            </div>
            <div className="px-3 py-2 bg-white/[0.03] border-t border-white/[0.08] text-center">
              <span className="text-[10px] font-bold text-white/35">{t('common.creditBuiltBy')} · {t('common.version')} {formatBuildVersion(
                // @ts-ignore build-time define, may be absent in some environments
                typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null
              )}</span>
            </div>
            </motion.div>
            ) : (
            <motion.div key="lang" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={MOTION.overlay} dir={isRTL ? 'rtl' : 'ltr'} role="group" aria-label={t('common.language')}>
              <div className="v12-menu-sub">
                <button onClick={() => setMenuPage('main')} className="v12-menu-back" aria-label={t('common.back')}>
                  {isRTL ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                </button>
                <Globe className="w-4 h-4 text-white/55" aria-hidden />
                <span>{t('common.language')}</span>
              </div>
              <div className="v12-lang-grid">
                {languages.map((lang) => {
                  const active = language === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => { setLanguage(lang.code); setShowUserMenu(false); }}
                      className={`v12-lang-opt ${active ? 'is-on' : ''}`}
                      aria-pressed={active}
                      lang={lang.code}
                    >
                      <span>{lang.native}</span>
                      {active && <Check className="w-4 h-4" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
            )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>, (userMenuRef.current?.closest('.chat-stage') as HTMLElement | null) ?? document.body)}
    </div>
  );
}
