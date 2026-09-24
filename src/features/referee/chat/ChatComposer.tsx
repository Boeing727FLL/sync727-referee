/** Message composer: reply preview, image attachments and send/stop controls. */
import { AnimatePresence, motion } from 'framer-motion';
import { Reply, Square, X } from 'lucide-react';
import { CameraGlyph, SendGlyph } from '../../v12/glyphs';
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
  quota?: { remaining: number; limit: number } | null;
};

export default function ChatComposer(props: Props) {
  const { replyTo, clearReply, attachments, removeAttachment, attachInputRef, onAttach,
    composerRef, input, setInput, resize, busy, learning, onSend, onStop, t, quotaText, quota } = props;
  const R = 24, C = 2 * Math.PI * R;
  const used = quota && quota.limit > 0 ? Math.min(1, Math.max(0, (quota.limit - quota.remaining) / quota.limit)) : 0;
  const canSend = !busy && !learning && (!!input.trim() || attachments.length > 0);
  return (
    <div className="v12-cmpw">
      <AnimatePresence>
        {replyTo && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 12, scaleY: 0.82 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: 8, scaleY: 0.9 }}
            transition={MOTION.morph}
            style={{ transformOrigin: 'bottom center' }}
            className="mb-2 flex items-center gap-2.5 rounded-[18px] v12-glass px-3 py-2"
          >
            <Reply className="shrink-0 w-4 h-4 text-[#9FD0FF]" />
            <div className="flex-1 min-w-0 text-start"><div className="text-[10px] font-black text-[#9FD0FF]">{t('chat.replyTo')}</div><div className="truncate text-xs text-white/85">{replyTo.text}</div></div>
            <button onClick={clearReply} aria-label="בטל תגובה" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={MOTION.morph} className="overflow-hidden">
            <div className="flex gap-2 px-2 pb-2"><AnimatePresence>{attachments.map(item => (
              <motion.div key={item.url} layout initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={MOTION.control} className="relative w-16 h-16 shrink-0">
                <img src={item.url} alt="" className="w-full h-full object-cover rounded-xl border border-white/30 shadow-[0_4px_14px_rgba(2,14,44,0.5)]" />
                <button onClick={() => removeAttachment(item.url)} aria-label="הסר תמונה" className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-[#0A2A60] border border-white/30 text-white/80 hover:text-white flex items-center justify-center cursor-pointer"><X className="w-3 h-3" /></button>
              </motion.div>
            ))}</AnimatePresence></div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="v12-cmp">
        {busy ? (
          <button type="button" className="v12-send is-stop" onClick={onStop} aria-label={t('chat.stop')} title={t('chat.stop')}>
            <span className="btn"><Square className="w-4 h-4 text-white" fill="currentColor" /></span>
          </button>
        ) : (
          <button type="button" className="v12-send" onClick={onSend} disabled={!canSend} aria-label={t('chat.send')} title={quotaText || t('chat.send')}>
            <svg className="r" viewBox="0 0 54 54" aria-hidden="true">
              <circle cx="27" cy="27" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2.5" />
              {quota && <circle className="arc" cx="27" cy="27" r={R} fill="none" stroke="#F2F5FA" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * used).toFixed(1)} />}
            </svg>
            <span className="btn"><SendGlyph /></span>
          </button>
        )}
        <textarea
          ref={composerRef}
          rows={1}
          value={input}
          onChange={event => { setInput(event.target.value); resize(); }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) { event.preventDefault(); onSend(); } }}
          placeholder={learning ? t('chat.researching') : t('v12.placeholder')}
          disabled={busy || learning}
          aria-label={t('chat.placeholder2')}
        />
        <button type="button" className="v12-cam" onClick={() => attachInputRef.current?.click()} disabled={busy || learning} aria-label={t('chat.attachImage')} title={t('chat.attachImage')}>
          <CameraGlyph />{t('v12.camera')}
        </button>
        <input ref={attachInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onAttach} />
      </div>
      <div className="v12-foot">
        {quota ? <span className="v12-num" aria-live="polite">{t('v12.quota').split('{remaining}')[0]}<b key={quota.remaining}>{quota.remaining}</b>{t('v12.quota').split('{remaining}')[1]?.replace('{limit}', String(quota.limit))}</span> : <span />}
        <span>{t('v12.community')}</span>
      </div>
    </div>
  );
}
