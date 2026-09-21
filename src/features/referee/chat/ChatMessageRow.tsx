/** One chat row. Streaming and typewriter clocks remain coordinator-owned. */
import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { Copy, FileText, Reply } from 'lucide-react';
import ThinkIndicator from '../../../components/ThinkIndicator';
import { MarkdownMessage } from '../ui/lazyComponents';
import type { MessageView } from './messageView';
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
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, scale: 0.985, clipPath: 'inset(0 0 100% 0 round 16px)' }} animate={{ opacity: 1, scale: 1, clipPath: 'inset(0 0 0% 0 round 16px)' }} exit={{ opacity: 0, scale: 0.99, clipPath: 'inset(0 0 100% 0 round 16px)' }} transition={MOTION.morph} className="flex gap-2.5 md:gap-3">
      <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full bg-white ring-1 ring-white/25 overflow-hidden flex items-center justify-center"><img src="/logoref.png" alt="" className="w-full h-full object-contain" /></div>
      <div className={`bg-white/[0.05] px-4 py-3 flex flex-col items-center gap-2 max-w-[85%] md:max-w-[75%] ${thinkContent ? 'rounded-2xl' : 'rounded-full'}`}>
        <ThinkIndicator />
        {thinkContent && <div className="text-[10px] md:text-xs font-mono text-slate-500 whitespace-pre-wrap max-h-48 overflow-y-auto">{thinkContent}</div>}
      </div>
    </motion.div>
  );
  const isUser = message.role === 'user';
  return (
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, y: 18, scale: 0.985, clipPath: 'inset(0 0 100% 0 round 16px)' }} animate={{ opacity: 1, y: 0, scale: 1, clipPath: 'inset(0 0 0% 0 round 16px)' }} exit={{ opacity: 0, y: -6, scale: 0.99, clipPath: 'inset(0 0 100% 0 round 16px)' }} transition={MOTION.filmReveal} className={`flex gap-2.5 md:gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
        {isUser ? (userPicture ? <img src={userPicture} alt="" className="w-full h-full object-cover rounded-full ring-1 ring-white/20" /> : <div className="w-full h-full rounded-full bg-white/10 flex items-center justify-center"><span className="text-xs md:text-sm font-black text-white">{(userName || 'U').trim().charAt(0)}</span></div>)
          : <div className="w-full h-full rounded-full bg-white overflow-hidden ring-1 ring-white/15"><img src="/logoref.png" alt={t('app.title')} className="w-full h-full object-contain" /></div>}
      </div>
      <div className={`flex flex-col gap-1.5 md:gap-2 min-w-0 ${isUser ? 'max-w-[85%] md:max-w-[70%] items-end' : 'min-w-0 max-w-[88%] md:max-w-[80%]'}`}>
        {!isUser && <div className="flex items-center gap-2 px-1"><span className="text-[10px] font-bold tracking-wide text-white/30">{t('chat.refereeTag')}</span>{text.includes('שריקה') && <span className="text-[10px] font-bold text-[#ff7a66]/80">{t('chat.foulTag')}</span>}</div>}
        <div className={`relative overflow-hidden transition-all duration-500 ${isUser ? 'bg-[#0a84ff] text-white rounded-[20px] rounded-se-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_6px_20px_rgba(10,132,255,0.3)] px-3.5 py-2.5 md:px-4 md:py-3' : 'bg-white/[0.08] border border-white/[0.14] backdrop-blur-xl backdrop-saturate-150 text-slate-100 rounded-[18px] rounded-ss-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_28px_rgba(0,0,0,0.3)] px-4 py-3 md:px-5 md:py-3.5'}`}>
                    {!!message.files?.length && <div className="flex flex-wrap gap-2 mb-3">{message.files.map((file, fileIndex) => <div key={fileIndex} className="relative w-16 h-16 md:w-28 md:h-28 group">{(file.key.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.base64?.startsWith('data:image')) ? <img src={file.url} alt="Attached" className="w-full h-full object-cover rounded-xl border border-white/15" /> : <div className="w-full h-full flex items-center justify-center bg-white/[0.06] rounded-xl border border-white/10"><FileText className="w-6 h-6 md:w-8 md:h-8 text-slate-400" /></div>}</div>)}</div>}
          <div className={`text-[15px] md:text-[16px] leading-relaxed ${isUser ? 'font-medium' : 'font-normal'}`}>
            {isUser ? <div className="whitespace-pre-wrap">{message.quote && <div className="mb-1.5 rounded-lg border-r-2 border-white/25 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/60 line-clamp-3 text-right">{message.quote}</div>}{message.text}</div>
              : <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-p:my-2 prose-p:text-slate-100 prose-headings:font-bold prose-headings:text-white prose-headings:mt-3 prose-headings:mb-1.5 prose-a:text-[#7FB8EC] prose-strong:text-[#FFC400] prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 prose-li:text-slate-200 rtl:text-right"><Suspense fallback={<span>{text}</span>}><MarkdownMessage components={{ em: ({ children, ...props }) => { const value = typeof children === 'string' ? children : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string' ? children[0] : null; return value === '▍' ? <span className="typewriter-cursor" aria-hidden>▍</span> : <em {...props}>{children}</em>; } }}>{typewriting ? text + '\u200B*\u258D*' : text}</MarkdownMessage></Suspense></div>}
          </div>
        </div>
        {!isUser && index > 0 && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...MOTION.filmReveal, delay: liveAnswer ? 0 : 0.12 }} className="flex items-center gap-1.5 px-0.5">
          <button onClick={() => onCopy(text)} className="text-[11px] md:text-xs font-bold text-white/35 hover:text-white transition-colors px-2 py-1 rounded-lg border border-transparent hover:border-white/15 cursor-pointer flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />{t('chat.copy')}</button>
          {!liveAnswer && <button onClick={() => onReply(text)} className="text-[11px] md:text-xs font-bold text-white/35 hover:text-white transition-colors px-2 py-1 rounded-lg border border-transparent hover:border-white/15 cursor-pointer flex items-center gap-1.5"><Reply className="w-3.5 h-3.5" />{t('chat.reply')}</button>}
        </motion.div>}
      </div>
    </motion.div>
  );
}
