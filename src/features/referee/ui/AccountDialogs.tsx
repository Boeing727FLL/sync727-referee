/** Account-related overlays. Destructive ordering stays in the coordinator handlers. */
import { AnimatePresence, motion } from 'framer-motion';
import { Scale } from 'lucide-react';
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center modal-safe-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} onClick={event => event.stopPropagation()} className="bg-slate-900 border border-red-500/50 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" ref={a11yRef} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="p-6 text-center space-y-4">
          <h3 className="text-xl font-bold text-white">{t('account.deleteTitle')}</h3>
          <p className="text-slate-400 text-sm">{t('account.deleteBody')}</p>
          <input type="password" name="current-password" autoComplete="current-password" value={password} onChange={event => { setPassword(event.target.value); clearError(); }} onKeyDown={event => event.key === 'Enter' && !deleting && onConfirm()} placeholder={t('account.passwordPlaceholder')} className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-base md:text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-all" />
          {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
        </div>
        <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex gap-3 justify-center">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-slate-400 hover:text-white font-bold transition-colors cursor-pointer">{t('common.cancel')}</button>
          <button onClick={onConfirm} disabled={deleting || !password} className="px-6 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{deleting ? t('account.deleting') : t('account.deleteConfirm')}</button>
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center modal-safe-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center" ref={a11yRef} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="p-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/15 flex items-center justify-center"><Scale className="w-8 h-8 text-red-400" /></div>
          <h3 className="text-lg font-black text-white mb-2">{t('account.kickedTitle')}</h3>
          <p className="text-slate-400 text-sm mb-6">{t('account.kickedBody')}</p>
          <button onClick={onReturnToLogin} className="w-full py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black transition-colors shadow-lg shadow-yellow-500/20">{t('account.backToLogin')}</button>
        </div>
      </motion.div>
    </motion.div>
  )}</AnimatePresence>;
}
