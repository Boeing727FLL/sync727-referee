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
};

export default function ChatComposer(props: Props) {
  const { replyTo, clearReply, attachments, removeAttachment, attachInputRef, onAttach,
    composerRef, input, setInput, resize, busy, learning, onSend, onStop, t } = props;
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
            className="w-full max-w-3xl mx-auto mb-2 flex items-center gap-2.5 rounded-2xl border border-white/20 bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_12px_32px_rgba(0,0,0,0.4)]"
          >
            <span className="shrink-0 w-8 h-8 rounded-full bg-[#0B6BCB]/25 border border-[#0B6BCB]/50 flex items-center justify-center shadow-[0_0_12px_rgba(11,107,203,0.35)]"><Reply className="w-4 h-4 text-[#7FB8EC]" /></span>
            <div className="flex-1 min-w-0 text-right"><div className="text-[10px] font-black text-[#7FB8EC]">{t('chat.replyTo')}</div><div className="truncate text-xs text-slate-200">{replyTo.text}</div></div>
            <button onClick={clearReply} aria-label="בטל תגובה" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-1 bg-[#0E1628] border border-white/15 rounded-2xl p-2 md:p-2.5 focus-within:border-[#0B6BCB] focus-within:shadow-[0_0_0_3px_rgba(11,107,203,0.22)] transition-all">
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
          <motion.button whileTap={{ scale: 0.9 }} transition={MOTION.tap} onClick={() => attachInputRef.current?.click()} disabled={busy || learning} aria-label={t('chat.attachImage')} title={t('chat.attachImage')} className="ms-auto shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ImagePlus className="w-5 h-5" /></motion.button>
          <input ref={attachInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onAttach} />
          {busy ? <motion.button whileTap={{ scale: 0.88 }} transition={MOTION.tap} onClick={onStop} aria-label="עצור" title="עצור" className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-[#E1251B] hover:bg-[#C11E16] text-white active:scale-90 transition-all cursor-pointer"><Square className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" /></motion.button>
            : <motion.button whileTap={{ scale: 0.88 }} transition={MOTION.tap} onClick={onSend} disabled={busy || learning || (!input.trim() && !attachments.length)} aria-label={t('chat.send')} className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-[#FFC400] hover:bg-[#E6B000] text-slate-950 active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-[0_4px_16px_rgba(250,204,21,0.35)] disabled:shadow-none"><Send className="w-4 h-4 md:w-5 md:h-5 -scale-x-100" /></motion.button>}
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-2"><img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-3 w-auto object-contain opacity-80" /><p className="text-[11px] text-slate-500 font-medium">נבנה בהתנדבות על ידי קבוצת Boeing 727 · {t('intro.notOfficial')}</p></div>
    </div>
  );
}
