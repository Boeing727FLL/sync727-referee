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

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

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

type VariantPalette = {
  emblemBg: string;
  emblemIcon: string;
  button: string;
  border: string;
  glow: string;
};

// ---------------------------------------------------------------------------
// Variant themes (one lookup, no conditionals in the JSX)
// ---------------------------------------------------------------------------

const VARIANTS: Record<NonNullable<ConfirmationModalProps['variant']>, VariantPalette> = {
  danger: {
    emblemBg: 'bg-red-500/15',
    emblemIcon: 'text-red-400',
    button: 'bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.35)]',
    border: 'border-red-500/30',
    glow: 'bg-red-500/20',
  },
  warning: {
    emblemBg: 'bg-gradient-to-br from-yellow-300 to-amber-500',
    emblemIcon: 'text-slate-950',
    button: 'bg-gradient-to-b from-yellow-300 to-yellow-500 hover:from-yellow-200 hover:to-yellow-400 text-slate-950 shadow-[0_8px_24px_rgba(250,204,21,0.3)]',
    border: 'border-yellow-400/30',
    glow: 'bg-yellow-400/20',
  },
  info: {
    emblemBg: 'bg-blue-500/15',
    emblemIcon: 'text-blue-400',
    button: 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white shadow-[0_8px_24px_rgba(59,130,246,0.35)]',
    border: 'border-blue-500/30',
    glow: 'bg-blue-500/20',
  },
};

// ---------------------------------------------------------------------------
// The modal
// ---------------------------------------------------------------------------

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  variant = 'danger'
}: ConfirmationModalProps) {
  const color = VARIANTS[variant];

  // No early return on purpose: AnimatePresence needs the tree mounted
  // to play the exit animation.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={e => e.stopPropagation()}
            className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.5)] w-full max-w-sm overflow-hidden"
          >
            <div className="p-6 md:p-7 text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className={`absolute -inset-3 ${color.glow} blur-xl rounded-full pointer-events-none`} aria-hidden />
                <div className={`relative w-full h-full ${color.emblemBg} rounded-full flex items-center justify-center border ${color.border}`}>
                  <AlertTriangle className={`w-7 h-7 ${color.emblemIcon}`} />
                </div>
              </div>
              <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed mt-2">{message}</p>
              <div className="flex gap-2.5 mt-6">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3.5 rounded-2xl bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 font-bold text-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 px-4 py-3.5 rounded-2xl ${color.button} font-black text-sm transition-all active:scale-[0.98] cursor-pointer`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
