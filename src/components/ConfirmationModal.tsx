/**
 * ConfirmationModal — generic two-button confirm dialog (floating window).
 *
 * WHAT: title + message + cancel/confirm, themed by `variant`
 * (danger red, warning gold, info blue). Confirm runs the action AND
 * closes; cancel only closes. All copy arrives via props (translated by
 * the caller), so this file owns zero user-facing strings.
 *
 * DESIGN: Apple-calm dark. Centered emblem, quiet title, airy actions.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useModalA11y } from '../lib/modalA11y';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger'
}: ConfirmationModalProps) {
  const { t, isRTL } = useLanguage();
  const a11yRef = useModalA11y(onClose);
  const confirmLabel = confirmText ?? t('common.confirm');
  const cancelLabel = cancelText ?? t('common.cancel');

  // No early return on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] v12-scrim flex items-center justify-center modal-safe-4"
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={e => e.stopPropagation()}
            className="v12-sheet w-full max-w-sm"
            ref={a11yRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            <div className="p-6 md:p-7 text-center">
              <div className={`v12-emblem mx-auto mb-4 ${variant === 'danger' ? 'is-danger' : variant === 'warning' ? 'is-warn' : ''}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="v12-sheet-title">{title}</h3>
              <p className="v12-sheet-body mt-2">{message}</p>
              <div className="flex gap-2.5 mt-6">
                <button
                  onClick={onClose}
                  className="flex-1 v12-btn v12-btn-ghost"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 v12-btn ${variant === 'danger' ? 'v12-btn-danger' : 'v12-btn-primary'}`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
