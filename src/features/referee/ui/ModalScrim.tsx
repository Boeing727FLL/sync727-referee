/**
 * ModalScrim - the shared modal shell: AnimatePresence keeps the tree
 * mounted so the exit animation can play, the scrim fades over the page
 * and (for most modals) an outside click closes. Each modal supplies its
 * stacking/safe-area classes, whether the warmer admin tint applies, and
 * whether the fade is the quick 0.2s tween or the default spring. The
 * sheet inside stays per-modal.
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

type Props = {
  isOpen: boolean;
  isRTL: boolean;
  /** Stacking + safe-area classes, e.g. 'z-[9999] modal-safe-3'. */
  layerClass: string;
  /** Admin tools dim with the warmer admin scrim tint. */
  admin?: boolean;
  /** Most scrims fade in 0.2s; a few use framer's default transition. */
  quickFade?: boolean;
  /** Outside click closes; confirmations stay up until an explicit choice. */
  onClose?: () => void;
  children: ReactNode;
};

export default function ModalScrim({ isOpen, isRTL, layerClass, admin = false, quickFade = false, onClose, children }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          {...(quickFade ? { transition: { duration: 0.2 } } : {})}
          className={`fixed inset-0 v12-scrim${admin ? ' v12-admin-scrim' : ''} flex items-center justify-center ${layerClass}`}
          dir={isRTL ? 'rtl' : 'ltr'}
          {...(onClose ? { onClick: onClose } : {})}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
