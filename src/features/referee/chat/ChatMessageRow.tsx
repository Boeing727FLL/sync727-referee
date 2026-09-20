/** One chat row. Streaming and typewriter clocks remain coordinator-owned. */
import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { Copy, FileText, Reply } from 'lucide-react';
import ThinkIndicator from '../../../components/ThinkIndicator';
import { MarkdownMessage } from '../ui/lazyComponents';
import type { MessageView } from './messageView';
import { STOPPED_TEXT } from '../config';
import { MOTION } from '../ui/motion';

type Props = {
  view: MessageView;
  userPicture: string;
  userName: string;
  onCopy: (text: string) => void;
  onReply: (text: string) => void;
  t: (key: string) => string;
};

export default function ChatMessageRow({ view, userPicture, userName, onCopy, onReply, t }: Props) {
  const { message, index, thinking, thinkContent, text, typewriting, liveAnswer } = view;
  if (thinking) return (
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={MOTION.content} className="flex gap-2.5 md:gap-3">
      <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full bg-white ring-1 ring-white/25 overflow-hidden flex items-center justify-center"><img src="/logoref.png" alt="" className="w-full h-full object-contain" /></div>
      <div className="bg-[#0E1628] border border-white/10 px-4 py-3 rounded-2xl flex flex-col items-center gap-2 max-w-[85%] md:max-w-[75%]">
        <ThinkIndicator />
        {thinkContent && <div className="text-[10px] md:text-xs font-mono text-slate-500 whitespace-pre-wrap max-h-48 overflow-y-auto">{thinkContent}</div>}
      </div>
    </motion.div>
  );
  const isUser = message.role === 'user';
  return (
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, y: 12, scale: 0.992 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.992 }} transition={MOTION.content} className={`flex gap-2.5 md:gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
        {isUser ? (userPicture ? <img src={userPicture} alt="" className="w-full h-full object-cover rounded-full ring-1 ring-white/20" /> : <div className="w-full h-full rounded-full bg-[#0B6BCB] flex items-center justify-center"><span className="text-xs md:text-sm font-black text-white">{(userName || 'U').trim().charAt(0)}</span></div>)
          : <div className={`w-full h-full rounded-full bg-white overflow-hidden transition-all duration-500 ${liveAnswer ? 'ring-2 ring-[#E1251B]/80 shadow-[0_0_18px_rgba(225,37,27,0.55)]' : 'ring-1 ring-white/25'}`}><img src="/logoref.png" alt="שופט וירטואלי" className="w-full h-full object-contain" /></div>}
      </div>
      <div className={`flex flex-col gap-1.5 md:gap-2 min-w-0 ${isUser ? 'max-w-[85%] md:max-w-[70%] items-end' : 'min-w-0 max-w-3xl'}`}>
        <div className={`relative overflow-hidden transition-all duration-500 ${isUser ? 'bg-[#0B6BCB] text-white rounded-2xl px-3.5 py-2.5 md:px-4 md:py-3' : `bg-gradient-to-b from-[#111f38] to-[#0E1628] border text-slate-100 rounded-2xl px-4 py-3 md:px-5 md:py-4 ${liveAnswer ? 'border-[#E1251B]/40 shadow-[0_0_36px_rgba(225,37,27,0.22)]' : 'border-white/10 shadow-[0_10px_32px_rgba(0,0,0,0.45)]'}`}`}>
          {!isUser && <span aria-hidden className={`absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-[#E1251B] via-[#ff6b5e] to-[#E1251B]/30 transition-all duration-500 ${liveAnswer ? 'shadow-[0_0_16px_rgba(225,37,27,0.95)]' : 'shadow-[0_0_8px_rgba(225,37,27,0.5)]'}`} />}
          {!isUser && <div className="flex items-center gap-1.5 mb-1.5 md:mb-2"><span className="text-[10px] md:text-[11px] font-black text-red-100 bg-[#E1251B]/15 border border-[#E1251B]/40 shadow-[0_0_12px_rgba(225,37,27,0.25)] px-2 py-0.5 rounded-full flex items-center gap-1">{t('chat.refereeTag')}</span>{text.includes('שריקה') && <span className="text-[10px] md:text-[11px] font-black text-white bg-[#E1251B] px-2 py-0.5 rounded-full">{t('chat.foulTag')}</span>}</div>}
          {!!message.files?.length && <div className="flex flex-wrap gap-2 mb-3">{message.files.map((file, fileIndex) => <div key={fileIndex} className="relative w-16 h-16 md:w-28 md:h-28 group">{(file.key.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.base64?.startsWith('data:image')) ? <img src={file.url} alt="Attached" className="w-full h-full object-cover rounded-xl border border-white/15" /> : <div className="w-full h-full flex items-center justify-center bg-white/[0.06] rounded-xl border border-white/10"><FileText className="w-6 h-6 md:w-8 md:h-8 text-slate-400" /></div>}</div>)}</div>}
          <div className={`text-[15px] md:text-[16px] leading-relaxed ${isUser ? 'font-medium' : 'font-normal'}`}>
            {isUser ? <div className="whitespace-pre-wrap">{message.quote && <div className="mb-1.5 rounded-lg border-r-2 border-white/60 bg-black/25 px-2.5 py-1.5 text-xs text-blue-100/90 line-clamp-3 text-right">{message.quote}</div>}{message.text}</div>
              : <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-p:my-2 prose-p:text-slate-100 prose-headings:font-bold prose-headings:text-white prose-headings:mt-3 prose-headings:mb-1.5 prose-a:text-[#7FB8EC] prose-strong:text-[#FFC400] prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 prose-li:text-slate-200 rtl:text-right"><Suspense fallback={<span>{text}</span>}><MarkdownMessage components={{ em: ({ children, ...props }) => { const value = typeof children === 'string' ? children : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string' ? children[0] : null; return value === '▍' ? <span className="typewriter-cursor" aria-hidden>▍</span> : <em {...props}>{children}</em>; } }}>{typewriting ? text + '\u200B*\u258D*' : text}</MarkdownMessage></Suspense></div>}
          </div>
        </div>
        {!isUser && index > 0 && message.text !== STOPPED_TEXT && <div className="flex items-center gap-1.5 px-0.5">
          <button onClick={() => onCopy(text)} className="text-[11px] md:text-xs font-bold text-slate-400 hover:text-white transition-all px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#E1251B]/50 hover:bg-[#E1251B]/10 hover:shadow-[0_0_12px_rgba(225,37,27,0.25)] cursor-pointer flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />{t('chat.copy')}</button>
          {!liveAnswer && <button onClick={() => onReply(text)} className="text-[11px] md:text-xs font-bold text-slate-400 hover:text-white transition-all px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#0B6BCB]/60 hover:bg-[#0B6BCB]/15 hover:shadow-[0_0_12px_rgba(11,107,203,0.3)] cursor-pointer flex items-center gap-1.5"><Reply className="w-3.5 h-3.5" />{t('chat.reply')}</button>}
        </div>}
      </div>
    </motion.div>
  );
}
