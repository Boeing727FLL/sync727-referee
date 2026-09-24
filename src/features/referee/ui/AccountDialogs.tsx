/** Account-related overlays. Destructive ordering stays in the coordinator handlers. */
import { AnimatePresence, motion } from 'framer-motion';
import { Scale, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../hooks/useLanguage';
import { useModalA11y } from '../../../lib/modalA11y';

type DeleteProps = {
  open: boolean;
  password: string;
  error: string | null;
  deleting: boolean;
  setPassword: (value: string) => void;
  clearError: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountDialog({ open, password, error, deleting, setPassword, clearError, onCancel, onConfirm }: DeleteProps) {
  const { t, isRTL } = useLanguage();
  const a11yRef = useModalA11y(onCancel);
  return <AnimatePresence>{open && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] v12-scrim flex items-center justify-center modal-safe-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} onClick={event => event.stopPropagation()} className="v12-sheet w-full max-w-sm" ref={a11yRef} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="p-6 pb-2 text-center space-y-4">
          <div className="v12-emblem is-danger mx-auto"><Trash2 className="w-6 h-6" /></div>
          <h3 className="v12-sheet-title">{t('account.deleteTitle')}</h3>
          <p className="v12-sheet-body">{t('account.deleteBody')}</p>
          <input type="password" name="current-password" autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); clearError(); }} onKeyDown={event => event.key === 'Enter' && !deleting && onConfirm()} placeholder={t('account.passwordPlaceholder')} className="v12-field text-base" />
          {error && <p className="text-[#FFB3B6] text-sm font-bold">{error}</p>}
        </div>
        <div className="p-6 pt-3 flex gap-2.5">
          <button onClick={onCancel} className="flex-1 v12-btn v12-btn-ghost">{t('common.cancel')}</button>
          <button onClick={onConfirm} disabled={deleting || !password} className="flex-1 v12-btn v12-btn-danger disabled:opacity-45 disabled:cursor-not-allowed">{deleting ? t('account.deleting') : t('account.deleteConfirm')}</button>
        </div>
      </motion.div>
    </motion.div>
  )}</AnimatePresence>;
}

type KickedProps = { open: boolean; onReturnToLogin: () => void };
export function SessionKickedDialog({ open, onReturnToLogin }: KickedProps) {
  const { t, isRTL } = useLanguage();
  const a11yRef = useModalA11y();
  return <AnimatePresence>{open && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] v12-scrim flex items-center justify-center modal-safe-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="v12-sheet w-full max-w-sm text-center" ref={a11yRef} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="p-6">
          <div className="v12-emblem mx-auto mb-4"><Scale className="w-6 h-6" /></div>
          <h3 className="v12-sheet-title mb-2">{t('account.kickedTitle')}</h3>
          <p className="v12-sheet-body mb-6">{t('account.kickedBody')}</p>
          <button onClick={onReturnToLogin} className="w-full v12-btn v12-btn-primary">{t('account.backToLogin')}</button>
        </div>
      </motion.div>
    </motion.div>
  )}</AnimatePresence>;
}
