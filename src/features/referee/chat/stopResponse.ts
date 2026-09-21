import type { ChatMessage } from '../types';
import { stripThinkBlocks } from './text.ts';

/**
 * Gemini-style Stop: everything already received stays as the final partial
 * answer. Only a never-started answer (nothing streamed yet, or still inside
 * private thinking) leaves no bubble at all.
 */
export function hasVisibleAnswer(text: string): boolean {
  return stripThinkBlocks(text).length > 0;
}

export function applyStopToMessages(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role === 'model' && !hasVisibleAnswer(last.text)) return messages.slice(0, -1);
  return messages;
}
