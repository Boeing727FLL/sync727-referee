import type { ChatMessage } from '../types';
import { stripThinkBlocks, THINK_CLOSE_RE, THINK_OPEN_RE } from './text.ts';

export type MessageView = {
  message: ChatMessage;
  index: number;
  thinking: boolean;
  thinkContent: string;
  text: string;
  fullText: string;
  typewriting: boolean;
  liveAnswer: boolean;
};

const normalizeArrows = (text: string) => text
  .replace(/\\?rightarrow/g, '->')
  .replace(/\\?leftarrow/g, '<-')
  .replace(/\$/g, '');

/** Derives display-only state without owning stream, timer or request lifecycle. */
export function buildMessageView(message: ChatMessage, index: number, options: {
  lastIndex: number;
  loading: boolean;
  typewriterReady: boolean;
  typewriterCount: number;
  typewriterTarget: number;
  chatStarted: boolean;
  stopped: boolean;
}): MessageView {
  const isModel = message.role === 'model';
  // The "you stopped this" note is plain UI text: no typewriter, no markdown.
  if (message.stopped) return { message, index, thinking: false, thinkContent: '', text: message.text, fullText: message.text, typewriting: false, liveAnswer: false };
  // Reasoning markup is stripped with the same tolerant rules everywhere
  // (text.ts): variant tags, unclosed blocks and truncated fragments from a
  // live stream must never reach the visible answer.
  const hasThink = THINK_OPEN_RE.test(message.text);
  const thinkContent = hasThink ? message.text.split(THINK_OPEN_RE)[1]?.split(THINK_CLOSE_RE)[0]?.trim() || '' : '';
  const thinking = isModel && hasThink && !THINK_CLOSE_RE.test(message.text) && options.loading && index === options.lastIndex;
  // No think-content fallback: a message whose visible text strips to empty
  // is private reasoning, never an answer to show.
  const fullText = isModel ? normalizeArrows(stripThinkBlocks(message.text)) : normalizeArrows(message.text);
  const isLastModel = index === options.lastIndex && isModel;
  const typewriting = isLastModel && !options.stopped && options.typewriterReady && options.typewriterCount < options.typewriterTarget;
  let text = typewriting ? fullText.split(/(\s+)/).slice(0, options.typewriterCount).join('') : fullText;
  if (isLastModel && !options.typewriterReady && options.chatStarted) text = '';
  return { message, index, thinking, thinkContent, text, fullText, typewriting, liveAnswer: typewriting };
}

export const typewriterLength = (text: string) => text.split(/(\s+)/).length;
