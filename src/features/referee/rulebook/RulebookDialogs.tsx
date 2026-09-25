/** Passive rulebook upload and destructive season-replacement dialogs. */
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, FileText, Upload } from 'lucide-react';
import { useLanguage } from '../../../hooks/useLanguage';

type Translate = (key: string) => string;

type UploadDialogProps = {
  open: boolean;
  uploading: boolean;
  progress: number;
  /** Clean, user-facing failure line from the last upload attempt. */
  error?: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  t: Translate;
};

export function RulebookUploadDialog({ open, uploading, progress, error, inputRef, onFile, onClose, t }: UploadDialogProps) {
  const { isRTL } = useLanguage();
  return <AnimatePresence>{open && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10030] v12-scrim flex items-center justify-center modal-safe-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="v12-sheet w-full max-w-sm max-h-[90dvh] overflow-y-auto p-6 space-y-6" role="dialog" aria-modal="true" aria-label={t('admin.uploadTitle')}>
        <div className="text-center">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4"><Upload className="w-8 h-8 text-blue-200" /></div>
          <h3 className="text-xl font-black text-white">{t('admin.uploadTitle')}</h3>
          <p className="text-white/75 text-sm mt-2">{t('admin.uploadDesc')}</p>
        </div>
        <div onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click(); } }} className="border-2 border-dashed border-white/30 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-200/50 hover:bg-white/10 transition-all group">
          <FileText className="w-10 h-10 text-white/80 group-hover:text-blue-200 transition-colors" />
          <span className="text-sm font-bold text-white/70 group-hover:text-blue-200">{t('admin.uploadPick')}</span>
          <input ref={inputRef} type="file" accept=".txt,.md,.json,.docx,.pdf,application/pdf" className="sr-only" tabIndex={-1} onChange={onFile} />
        </div>
        {error && <p className="text-center text-xs font-bold text-red-300">{error}</p>}
        {uploading && <div className="w-full space-y-2">
          <div className="flex justify-between text-xs font-bold text-white/75"><span>{t('admin.uploading')}</span><span>{progress}%</span></div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-yellow-400 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} /></div>
        </div>}
        <button onClick={onClose} className="v12-btn v12-btn-ghost w-full">{t('admin.cancel')}</button>
      </motion.div>
    </motion.div>
  )}</AnimatePresence>;
}

type SeasonReplacement = { fileName: string; season: string; oldCount: number };
type SeasonWipeProps = { pending: SeasonReplacement | null; typed: string; setTyped: (value: string) => void; onCancel: () => void; onConfirm: () => void };

export function SeasonWipeDialog({ pending, typed, setTyped, onCancel, onConfirm }: SeasonWipeProps) {
  const { t, isRTL } = useLanguage();
  return <AnimatePresence>{pending && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10040] v12-scrim flex items-center justify-center modal-safe-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="v12-sheet w-full max-w-sm max-h-[90dvh] overflow-y-auto p-6 space-y-4" role="alertdialog" aria-modal="true" aria-label={t('owner.uploadSeasonTitle')}>
        <div className="text-center"><div className="w-14 h-14 mx-auto mb-2 rounded-full bg-red-500/15 flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-red-300" /></div><h3 className="text-xl font-black text-white">{t('owner.uploadSeasonTitle')}</h3><p className="text-white/75 text-sm mt-2 leading-relaxed">{t('owner.uploadSeasonDesc').replace('{file}', pending.fileName).replace('{season}', pending.season).replace('{count}', String(pending.oldCount))}</p></div>
        <input type="text" value={typed} onChange={event => setTyped(event.target.value)} placeholder={pending.season} className="w-full px-4 py-3 rounded-xl border-2 border-red-300/50 bg-[#0A2A60]/65 text-white font-black text-base md:text-sm text-center tracking-widest outline-none focus:border-red-500 transition-all" dir="ltr" />
        <div className="flex gap-2">
          <button onClick={onCancel} className="v12-btn v12-btn-ghost flex-1">{t('common.cancel')}</button>
          <button onClick={onConfirm} disabled={typed.trim().toUpperCase() !== pending.season.toUpperCase()} className="v12-btn v12-btn-danger flex-1 disabled:opacity-40 disabled:cursor-not-allowed">{t('owner.deleteUpload')}</button>
        </div>
      </motion.div>
    </motion.div>
  )}</AnimatePresence>;
}
