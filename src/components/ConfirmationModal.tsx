import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

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
  const colors = {
    danger: {
      bg: 'bg-red-500/20',
      icon: 'text-red-500',
      button: 'bg-red-500 hover:bg-red-600 shadow-red-500/20',
      border: 'border-red-500/50'
    },
    warning: {
      bg: 'bg-orange-500/20',
      icon: 'text-orange-500',
      button: 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20',
      border: 'border-orange-500/50'
    },
    info: {
      bg: 'bg-blue-500/20',
      icon: 'text-blue-500',
      button: 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20',
      border: 'border-blue-500/50'
    }
  };

  const color = colors[variant];

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
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 text-center space-y-4">
              <div className={`w-16 h-16 ${color.bg} rounded-full flex items-center justify-center mx-auto`}>
                <AlertTriangle className={`w-8 h-8 ${color.icon}`} />
              </div>
              <h3 className="text-xl font-bold text-white">{title}</h3>
              <p className="text-slate-400">{message}</p>
            </div>
            <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white font-bold transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`px-6 py-2 rounded-lg ${color.button} text-white font-bold transition-colors shadow-lg`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
