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
            className="w-full max-w-3xl mx-auto mb-2 flex items-center gap-2.5 rounded-xl border-r-2 border-[#c2372f]/60 bg-[#1b2434]/[0.04] px-3 py-2"
          >
            <Reply className="shrink-0 w-4 h-4 text-[#c2372f]/80" />
            <div className="flex-1 min-w-0 text-right"><div className="text-[10px] font-black text-[#c2372f]/80">{t('chat.replyTo')}</div><div className="truncate text-xs text-[#1b2434]/80">{replyTo.text}</div></div>
            <button onClick={clearReply} aria-label="בטל תגובה" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[#1b2434]/45 hover:text-[#141d2e] hover:bg-[#1b2434]/10 transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-1 rounded-[22px] border border-[#1b2434]/15 bg-[#f6f2e8] shadow-[0_14px_40px_rgba(0,0,0,0.45)] px-2 pt-1.5 md:pt-2 focus-within:border-[#1d2a44]/50 transition-colors">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0, clipPath: 'inset(100% 0 0 0 round 12px)' }} animate={{ opacity: 1, height: 'auto', clipPath: 'inset(0% 0 0 0 round 12px)' }} exit={{ opacity: 0, height: 0, clipPath: 'inset(100% 0 0 0 round 12px)' }} transition={MOTION.morph} className="overflow-hidden">
              <div className="flex gap-2 px-1 pt-1 pb-1"><AnimatePresence>{attachments.map(item => (
                <motion.div key={item.url} layout initial={{ opacity: 0, scale: 0.75, filter: 'blur(6px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.7, filter: 'blur(6px)' }} transition={MOTION.control} className="relative w-16 h-16 shrink-0">
                  <img src={item.url} alt="" className="w-full h-full object-cover rounded-xl border border-[#1b2434]/20 shadow-[0_4px_14px_rgba(0,0,0,0.45)]" />
                  <button onClick={() => removeAttachment(item.url)} aria-label="הסר תמונה" className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-[#f6f2e8] border border-[#1b2434]/25 text-[#1b2434]/60 hover:text-[#141d2e] flex items-center justify-center cursor-pointer"><X className="w-3 h-3" /></button>
                </motion.div>
              ))}</AnimatePresence></div>
            </motion.div>
          )}
        </AnimatePresence>
        <textarea ref={composerRef} rows={1} value={input} onChange={event => { setInput(event.target.value); resize(); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) { event.preventDefault(); onSend(); } }} placeholder={learning ? t('chat.researching') : t('chat.placeholder2')} disabled={busy || learning} aria-label={t('chat.placeholder2')} className="w-full bg-transparent px-3 md:px-4 py-2 md:py-2.5 focus:outline-none text-base text-[#141d2e] placeholder-[#1b2434]/40 font-medium disabled:opacity-50 resize-none overflow-y-auto" style={{ minHeight: 44, maxHeight: 132 }} />
        <div className="flex items-center gap-2 px-1 pb-0.5">
          <span className="hidden md:block text-[11px] text-[#1b2434]/40 font-medium select-none">{t('chat.shiftHint')}</span>
          <motion.button whileTap={{ scale: 0.9 }} transition={MOTION.tap} onClick={() => attachInputRef.current?.click()} disabled={busy || learning} aria-label={t('chat.attachImage')} title={t('chat.attachImage')} className="ms-auto shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[#1b2434]/45 hover:text-[#141d2e] hover:bg-[#1b2434]/[0.06] active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ImagePlus className="w-5 h-5" /></motion.button>
          <input ref={attachInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onAttach} />
          {busy ? <motion.button whileTap={{ scale: 0.88 }} transition={MOTION.tap} onClick={onStop} aria-label="עצור" title="עצור" className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#1b2434]/[0.06] hover:bg-[#1b2434]/[0.1] text-[#c2372f] active:scale-90 transition-all cursor-pointer"><Square className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" /></motion.button>
            : <motion.button whileTap={{ scale: 0.88 }} transition={MOTION.tap} onClick={onSend} disabled={busy || learning || (!input.trim() && !attachments.length)} aria-label={t('chat.send')} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#1d2a44] hover:bg-[#27395c] text-[#f6f2e8] shadow-[0_8px_20px_rgba(29,42,68,0.4)] active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><Send className="w-4 h-4 md:w-5 md:h-5 -scale-x-100" /></motion.button>}
        </div>
      </div>
      {quotaText && <div className="mt-1.5 text-center text-[11px] font-semibold text-slate-400" aria-live="polite">{quotaText}</div>}
      <div className="flex items-center justify-center gap-1.5 mt-2"><img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3 w-auto object-contain opacity-80" /><p className="text-[11px] text-slate-500 font-medium">{t('common.creditBuiltBy')} · {t('intro.notOfficial')}</p></div>
    </div>
  );
}
