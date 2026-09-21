/** Message composer: reply preview, image attachments and send/stop controls. */
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Reply, Send, Square, X } from 'lucide-react';
import { MOTION } from '../ui/motion';

type Attachment = { file: File; url: string };
type Props = {
  replyTo: { text: string } | null;
  clearReply: () => void;
  attachments: Attachment[];
  removeAttachment: (url: string) => void;
  attachInputRef: React.RefObject<HTMLInputElement | null>;
  onAttach: (event: React.ChangeEvent<HTMLInputElement>) => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (value: string) => void;
  resize: () => void;
  busy: boolean;
  learning: boolean;
  onSend: () => void;
  onStop: () => void;
  t: (key: string) => string;
  quotaText?: string | null;
};

export default function ChatComposer(props: Props) {
  const { replyTo, clearReply, attachments, removeAttachment, attachInputRef, onAttach,
    composerRef, input, setInput, resize, busy, learning, onSend, onStop, t, quotaText } = props;
  return (
    <div className="px-3 md:px-10 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 relative z-10">
      <AnimatePresence>
        {replyTo && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 12, scaleY: 0.82, clipPath: 'inset(100% 0 0 0 round 16px)' }}
            animate={{ opacity: 1, y: 0, scaleY: 1, clipPath: 'inset(0% 0 0 0 round 16px)' }}
            exit={{ opacity: 0, y: 8, scaleY: 0.9, clipPath: 'inset(100% 0 0 0 round 16px)' }}
            transition={MOTION.morph}
            style={{ transformOrigin: 'bottom center' }}
            className="w-full max-w-3xl mx-auto mb-2 flex items-center gap-2.5 rounded-xl border-r-2 border-[rgba(159,216,198,0.5)] bg-white/[0.03] px-3 py-2"
          >
            <Reply className="shrink-0 w-4 h-4 text-[#9fd8c6]/80" />
            <div className="flex-1 min-w-0 text-right"><div className="text-[10px] font-black text-[#9fd8c6]/80">{t('chat.replyTo')}</div><div className="truncate text-xs text-slate-200">{replyTo.text}</div></div>
            <button onClick={clearReply} aria-label="בטל תגובה" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-1 border-t border-white/[0.12] px-1 pt-2 md:pt-2.5 focus-within:border-[rgba(159,216,198,0.55)] transition-colors">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0, clipPath: 'inset(100% 0 0 0 round 12px)' }} animate={{ opacity: 1, height: 'auto', clipPath: 'inset(0% 0 0 0 round 12px)' }} exit={{ opacity: 0, height: 0, clipPath: 'inset(100% 0 0 0 round 12px)' }} transition={MOTION.morph} className="overflow-hidden">
              <div className="flex gap-2 px-1 pt-1 pb-1"><AnimatePresence>{attachments.map(item => (
                <motion.div key={item.url} layout initial={{ opacity: 0, scale: 0.75, filter: 'blur(6px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.7, filter: 'blur(6px)' }} transition={MOTION.control} className="relative w-16 h-16 shrink-0">
                  <img src={item.url} alt="" className="w-full h-full object-cover rounded-xl border border-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.45)]" />
                  <button onClick={() => removeAttachment(item.url)} aria-label="הסר תמונה" className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-slate-950/90 border border-white/25 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"><X className="w-3 h-3" /></button>
                </motion.div>
              ))}</AnimatePresence></div>
            </motion.div>
          )}
        </AnimatePresence>
        <textarea ref={composerRef} rows={1} value={input} onChange={event => { setInput(event.target.value); resize(); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) { event.preventDefault(); onSend(); } }} placeholder={learning ? t('chat.researching') : t('chat.placeholder2')} disabled={busy || learning} aria-label={t('chat.placeholder2')} className="w-full bg-transparent px-3 md:px-4 py-2 md:py-2.5 focus:outline-none text-base text-white placeholder-slate-500 font-medium disabled:opacity-50 resize-none overflow-y-auto" style={{ minHeight: 44, maxHeight: 132 }} />
        <div className="flex items-center gap-2 px-1 pb-0.5">
          <span className="hidden md:block text-[11px] text-slate-600 font-medium select-none">{t('chat.shiftHint')}</span>
          <motion.button whileTap={{ scale: 0.9 }} transition={MOTION.tap} onClick={() => attachInputRef.current?.click()} disabled={busy || learning} aria-label={t('chat.attachImage')} title={t('chat.attachImage')} className="ms-auto shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white/35 hover:text-white hover:bg-white/[0.06] active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ImagePlus className="w-5 h-5" /></motion.button>
          <input ref={attachInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onAttach} />
          {busy ? <motion.button whileTap={{ scale: 0.88 }} transition={MOTION.tap} onClick={onStop} aria-label="עצור" title="עצור" className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-red-500/90 hover:bg-red-500 text-white active:scale-90 transition-all cursor-pointer"><Square className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" /></motion.button>
            : <motion.button whileTap={{ scale: 0.88 }} transition={MOTION.tap} onClick={onSend} disabled={busy || learning || (!input.trim() && !attachments.length)} aria-label={t('chat.send')} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-yellow-400 hover:bg-yellow-300 text-slate-950 active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Send className="w-4 h-4 md:w-5 md:h-5 -scale-x-100" /></motion.button>}
        </div>
      </div>
      {quotaText && <div className="mt-1.5 text-center text-[11px] font-semibold text-slate-400" aria-live="polite">{quotaText}</div>}
      <div className="flex items-center justify-center gap-1.5 mt-2"><img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3 w-auto object-contain opacity-80" /><p className="text-[11px] text-slate-500 font-medium">{t('common.creditBuiltBy')} · {t('intro.notOfficial')}</p></div>
    </div>
  );
}
