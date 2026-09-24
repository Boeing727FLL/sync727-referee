/** One chat row (v12 look). Streaming and typewriter clocks remain coordinator-owned. */
import { Suspense, memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, FileText, Reply, ThumbsDown, ThumbsUp } from 'lucide-react';
import Referee from '../../v12/Referee';
import { MarkdownMessage } from '../ui/lazyComponents';
import type { MessageView } from './messageView';
import { MOTION } from '../ui/motion';

type Props = {
  view: MessageView;
  userPicture: string;
  userName: string;
  onCopy: (text: string) => void;
  onReply: (text: string) => void;
  onRate?: (index: number, up: boolean) => void;
  /** User rows only: whether the referee already picked the question up. */
  seen?: boolean;
  /** Model rows only: this is the newest answer. */
  latest?: boolean;
  t: (key: string) => string;
};

const hhmm = (ms?: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The referee's round badge (face centered) used in the answer header. */
export function RefereeBadge({ thinking = false, happy = false }: { thinking?: boolean; happy?: boolean }) {
  return <div className={`v12-ai-o ${thinking ? 'is-think' : ''}`}><Referee size={46} happy={happy} /></div>;
}

/** The thinking card: FIRST-colour edge light around the glass and a
 *  quiet "חושב" inside (the old orb animation was removed on request). */
export function ThinkingCard({ thinkContent, t }: { thinkContent?: string; t: (key: string) => string }) {
  return (
    <div className="v12-cardx">
      <div className="v12-bloom" aria-hidden />
      <div className="v12-card2">
        <div className="v12-edge" aria-hidden />
        <div className="v12-ai-h">
          <RefereeBadge thinking />
          <div><div className="v12-ai-nm">{t('chat.refereeTag')}</div><div className="v12-ai-st">{t('v12.thinking')}</div></div>
        </div>
        <div className="v12-think">
          <span className="v12-think-lbl" role="status">
            {t('chat.thinking2').replace(/[.…]+$/u, '').split('').map((ch, i) => (
              <span key={i} className="thinking-letter" style={{ animationDelay: `${i * 0.07}s` }}>{ch === ' ' ? '\u00A0' : ch}</span>
            ))}
          </span>
          {thinkContent && <div className="text-[10px] md:text-xs font-mono text-white/45 whitespace-pre-wrap max-h-48 overflow-y-auto w-full">{thinkContent}</div>}
        </div>
      </div>
    </div>
  );
}

function ChatMessageRow({ view, userPicture: _userPicture, userName: _userName, onCopy, onReply, onRate, seen = false, latest = false, t }: Props) {
  const { message, index, thinking, thinkContent, text, typewriting, liveAnswer } = view;
  const [rated, setRated] = useState<null | 'up' | 'down'>(null);
  if (thinking) return (
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.99 }} transition={MOTION.morph}>
      <ThinkingCard thinkContent={thinkContent} t={t} />
    </motion.div>
  );
  if (message.stopped) return (
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={MOTION.filmReveal} className="flex items-center gap-2.5">
      <div style={{ opacity: 0.6 }}><RefereeBadge /></div>
      <div className="rounded-full v12-glass px-3.5 py-1.5 text-[13px] md:text-sm font-semibold text-white/70" role="status">{text}</div>
    </motion.div>
  );
  const isUser = message.role === 'user';
  const files = !!message.files?.length && (
    <div className="flex flex-wrap gap-2 mb-2">{message.files!.map((file, fileIndex) => (
      <div key={fileIndex} className="relative w-16 h-16 md:w-28 md:h-28">
        {(file.key.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.base64?.startsWith('data:image'))
          ? <img src={file.url} alt="Attached" className="w-full h-full object-cover rounded-xl border border-white/20" />
          : <div className="w-full h-full flex items-center justify-center bg-white/[0.08] rounded-xl border border-white/15"><FileText className="w-6 h-6 md:w-8 md:h-8 text-white/60" /></div>}
      </div>))}</div>
  );
  if (isUser) return (
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, y: 40, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={MOTION.filmReveal} className="v12-ub-wrap">
      <div className="v12-ub whitespace-pre-wrap break-words">
        {files}
        {message.quote && <div className="mb-1.5 rounded-lg border-s-2 border-white/40 bg-white/[0.1] px-2.5 py-1.5 text-xs text-white/75 line-clamp-3">{message.quote}</div>}
        {message.text}
      </div>
      {message.sentAt && <div className="v12-meta">{t('v12.sent')} {hhmm(message.sentAt)}{seen && <> · <b>{t('v12.read')}</b></>}</div>}
    </motion.div>
  );
  const rate = (up: boolean) => { if (rated) return; setRated(up ? 'up' : 'down'); onRate?.(index, up); };
  return (
    <motion.div layout layoutId={`message-${index}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={MOTION.filmReveal} className="v12-cardx is-done">
      {liveAnswer && <div className="v12-bloom" aria-hidden />}
      <div className="v12-card2">
        {liveAnswer && <div className="v12-edge" aria-hidden />}
        <div className="v12-ai-h">
          <RefereeBadge happy={!typewriting} />
          <div>
            <div className="v12-ai-nm">{t('chat.refereeTag')}{text.includes('שריקה') && <span className="ms-2 text-[11px] font-bold text-[#FF8A8E]">{t('chat.foulTag')}</span>}</div>
            {latest && <div className="v12-ai-st">{typewriting ? t('v12.answering') : t('v12.answered')}</div>}
          </div>
        </div>
        <div className="v12-ai-tx">
          {files}
          <div className="prose prose-invert max-w-none break-words prose-p:leading-relaxed prose-p:my-2 prose-p:text-[rgba(238,243,250,0.92)] prose-headings:font-bold prose-headings:text-white prose-headings:mt-3 prose-headings:mb-1.5 prose-a:text-[#9FD0FF] prose-strong:text-white prose-strong:font-extrabold prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 prose-li:text-[rgba(238,243,250,0.9)] rtl:text-right text-[16px] md:text-[17px]">
            <Suspense fallback={<span>{text}</span>}><MarkdownMessage components={{ em: ({ children, ...props }) => { const value = typeof children === 'string' ? children : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string' ? children[0] : null; return value === '▍' ? <span className="typewriter-cursor" aria-hidden>▍</span> : <em {...props}>{children}</em>; } }}>{typewriting ? text + '\u200B*\u258D*' : text}</MarkdownMessage></Suspense>
          </div>
        </div>
        {index > 0 && !typewriting && (
          <div className="v12-acts">
            <button type="button" className="v12-act" onClick={() => onCopy(text)} aria-label={t('chat.copy')} title={t('chat.copy')}><Copy size={15} /></button>
            {!liveAnswer && <button type="button" className="v12-act" onClick={() => onReply(text)} aria-label={t('chat.reply')} title={t('chat.reply')}><Reply size={15} /></button>}
            {onRate && <>
              <button type="button" className={`v12-act ${rated === 'up' ? 'is-on' : ''}`} onClick={() => rate(true)} aria-label={t('v12.like')} title={t('v12.like')} aria-pressed={rated === 'up'}><ThumbsUp size={15} /></button>
              <button type="button" className={`v12-act ${rated === 'down' ? 'is-on' : ''}`} onClick={() => rate(false)} aria-label={t('v12.dislike')} title={t('v12.dislike')} aria-pressed={rated === 'down'}><ThumbsDown size={15} /></button>
            </>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Long-chat guard: the coordinator re-renders on every composer keystroke
 * and typewriter tick, rebuilding each view object by value. Rows only need
 * to re-render when their own visible inputs change, so compare the view by
 * value. onCopy/onReply/onRate are inline closures with stable semantics.
 */
function areEqual(prev: Props, next: Props): boolean {
  const a = prev.view, b = next.view;
  return a.message === b.message
    && a.index === b.index
    && a.thinking === b.thinking
    && a.thinkContent === b.thinkContent
    && a.text === b.text
    && a.fullText === b.fullText
    && a.typewriting === b.typewriting
    && a.liveAnswer === b.liveAnswer
    && prev.seen === next.seen
    && prev.latest === next.latest
    && prev.userPicture === next.userPicture
    && prev.userName === next.userName
    && prev.t === next.t;
}

export default memo(ChatMessageRow, areEqual);
