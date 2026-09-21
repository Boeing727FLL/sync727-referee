/** Passive rulebook upload and destructive season-replacement dialogs. */
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, FileText, Upload } from 'lucide-react';

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
  return <AnimatePresence>{open && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4"><Upload className="w-8 h-8 text-blue-600" /></div>
          <h3 className="text-xl font-black text-slate-800">{t('admin.uploadTitle')}</h3>
          <p className="text-slate-500 text-sm mt-2">{t('admin.uploadDesc')}</p>
        </div>
        <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-600/50 hover:bg-blue-600/5 transition-all group">
          <FileText className="w-10 h-10 text-slate-300 group-hover:text-blue-600 transition-colors" />
          <span className="text-sm font-bold text-slate-400 group-hover:text-blue-600">{t('admin.uploadPick')}</span>
          <input ref={inputRef} type="file" accept=".txt,.md,.json,.docx,.pdf,application/pdf" className="hidden" onChange={onFile} />
        </div>
        {error && <p className="text-center text-xs font-bold text-red-600">{error}</p>}
        {uploading && <div className="w-full space-y-2">
          <div className="flex justify-between text-xs font-bold text-slate-500"><span>{t('admin.uploading')}</span><span>{progress}%</span></div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} /></div>
        </div>}
        <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition-colors">{t('admin.cancel')}</button>
      </motion.div>
    </motion.div>
  )}</AnimatePresence>;
}

type SeasonReplacement = { fileName: string; season: string; oldCount: number };
type SeasonWipeProps = { pending: SeasonReplacement | null; typed: string; setTyped: (value: string) => void; onCancel: () => void; onConfirm: () => void };

export function SeasonWipeDialog({ pending, typed, setTyped, onCancel, onConfirm }: SeasonWipeProps) {
  return <AnimatePresence>{pending && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="text-center"><div className="w-14 h-14 mx-auto mb-2 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-red-600" /></div><h3 className="text-xl font-black text-slate-800">מחיקת עונה שלמה</h3><p className="text-slate-500 text-sm mt-2 leading-relaxed">הקובץ {pending.fileName} מזוהה כעונה חדשה ({pending.season}). ההעלאה תמחק {pending.oldCount} קבצי חוקים ישנים. כדי לאשר, הקלידו את שם העונה.</p></div>
        <input type="text" value={typed} onChange={event => setTyped(event.target.value)} placeholder={pending.season} className="w-full px-4 py-3 rounded-xl border-2 border-red-300 bg-red-50 text-slate-900 font-black text-base md:text-sm text-center tracking-widest outline-none focus:border-red-500 transition-all" dir="ltr" />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition-colors">ביטול</button>
          <button onClick={onConfirm} disabled={typed.trim().toUpperCase() !== pending.season.toUpperCase()} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed">מחק והעלה</button>
        </div>
      </motion.div>
    </motion.div>
  )}</AnimatePresence>;
}
