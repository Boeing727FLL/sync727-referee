import type { ChatMessage } from '../types';

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
}): MessageView {
  const isModel = message.role === 'model';
  const hasThink = message.text.includes('<think>');
  const thinkContent = hasThink ? message.text.split('<think>')[1]?.split('</think>')[0]?.trim() || '' : '';
  const thinking = isModel && hasThink && !message.text.includes('</think>') && options.loading && index === options.lastIndex;
  const thinkBlock = new RegExp('<think>[\\s\\S]*</think>', 'g');
  let fullText = isModel ? normalizeArrows(message.text.replace(thinkBlock, '')).trim() : normalizeArrows(message.text);
  if (!fullText && isModel) {
    fullText = thinkContent ? normalizeArrows(thinkContent).trim() : hasThink ? normalizeArrows(message.text.replace('<think>', '')).trim() : '';
  }
  const isLastModel = index === options.lastIndex && isModel;
  const typewriting = isLastModel && options.typewriterReady && options.typewriterCount < options.typewriterTarget;
  let text = typewriting ? fullText.split(/(\s+)/).slice(0, options.typewriterCount).join('') : fullText;
  if (isLastModel && !options.typewriterReady && options.chatStarted) text = '';
  return { message, index, thinking, thinkContent, text, fullText, typewriting, liveAnswer: typewriting };
}

export const typewriterLength = (text: string) => text.split(/(\s+)/).length;
