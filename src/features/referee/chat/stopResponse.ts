import type { ChatMessage } from '../types';
import { stripThinkBlocks } from './text.ts';

/**
 * Gemini-style Stop: everything already received stays as the final partial
 * answer. An answer that never started (nothing streamed yet, or still
 * inside private thinking) is replaced by a short note saying the user
 * stopped it, so the question never hangs without a reply.
 */
export function hasVisibleAnswer(text: string): boolean {
  return stripThinkBlocks(text).length > 0;
}

/** Drop a trailing model bubble that never reached visible text. */
export function dropInvisibleAnswer(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role === 'model' && !last.stopped && !hasVisibleAnswer(last.text)) return messages.slice(0, -1);
  return messages;
}

export function applyStopToMessages(messages: ChatMessage[], stoppedNote: string): ChatMessage[] {
  const trimmed = dropInvisibleAnswer(messages);
  const last = trimmed[trimmed.length - 1];
  // Idempotent: a second Stop or a late settlement adds nothing.
  if (last?.role === 'model') return trimmed === messages ? messages : trimmed;
  if (last?.role !== 'user') return trimmed;
  return [...trimmed, { role: 'model', text: stoppedNote, stopped: true }];
}

/** History for the model: the local "you stopped" notes are UI only. */
export function withoutStopNotes(messages: ChatMessage[]): ChatMessage[] {
  return messages.some(m => m.stopped) ? messages.filter(m => !m.stopped) : messages;
}
