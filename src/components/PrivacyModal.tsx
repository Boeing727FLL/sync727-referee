/**
 * PrivacyModal — privacy policy as a floating window over the live chat.
 *
 * WHAT: the shared PrivacyContent (also used by the /privacy route) plus
 * a gold "back to chat" button. Closing plays the signature 2-second
 * divine exit (panel rises with blur while a gold bloom breathes) that
 * reveals the chat underneath — timings below are product behavior,
 * never "cleaned up".
 *
 * COPY: lives in src/legal/copy.ts (12 languages); kind='terms' shows the Terms of Use.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ScrollText, X, ArrowRight } from 'lucide-react';
import { PrivacyContent, TermsContent, useLegal } from './LegalContent';
import { useLanguage } from '../hooks/useLanguage';
import { useModalA11y } from '../lib/modalA11y';

export { PrivacyContent } from './LegalContent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Which document to show (default: privacy). */
  kind?: 'privacy' | 'terms';
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

export default function PrivacyModal({ isOpen, onClose, kind = 'privacy' }: Props) {
  const { t } = useLanguage();
  const legal = useLegal();
  const Icon = kind === 'terms' ? ScrollText : ShieldCheck;
  const a11yRef = useModalA11y(onClose);
  // No early return here on purpose: AnimatePresence needs the tree mounted
  // to play the 2s divine exit animation. Returning null would kill it instantly.
  return (
    <AnimatePresence>
      {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, transition: { duration: 1.4, ease: [0.22, 1, 0.36, 1] } }}
            className="fixed inset-0 z-[9000] v12-scrim flex items-center justify-center modal-safe-4"
            dir="rtl"
          >
            <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ scale: 1.07, opacity: 0, y: -70, filter: 'blur(14px)', transition: { duration: 2, ease: [0.22, 1, 0.36, 1] } }}
            transition={
              { duration: 2.25, ease: [0.22, 1, 0.36, 1], times: [0, 0.7, 1] } as any
            }
            className="v12-sheet w-full max-w-md max-h-[88dvh] flex flex-col"
            ref={a11yRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            {/* Divine gold bloom on exit */}
            <motion.div
              className="absolute inset-0 rounded-[24px] pointer-events-none"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: [0, 0.55, 0], scale: [1, 1.12, 1.25], transition: { duration: 2, ease: [0.22, 1, 0.36, 1] } }}
              style={{ boxShadow: '0 0 90px 30px rgba(150,205,255,0.3), inset 0 0 60px rgba(150,205,255,0.12)' }}
            />
            <div className="p-6 md:p-7 relative overflow-y-auto no-scrollbar">
              <button
                onClick={onClose}
                aria-label={t('common.close')}
                className="v12-sheet-x"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3 mb-5 pe-10">
                <div className="v12-emblem"><Icon className="w-6 h-6" /></div>
                <h3 className="v12-sheet-title">{legal[kind].title}</h3>
              </div>
              <div className="v12-sheet-body text-start">
                {kind === 'terms' ? <TermsContent /> : <PrivacyContent />}
              </div>
              <button
                onClick={onClose}
                className="mt-6 w-full v12-btn v12-btn-primary"
              >
                <ArrowRight className="w-4 h-4" />
                {t('privacy.backToChat')}
              </button>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3.5 w-auto object-contain opacity-70" />
                <span className="text-[11px] font-bold text-white/45">{t('common.creditBuiltBy')}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
