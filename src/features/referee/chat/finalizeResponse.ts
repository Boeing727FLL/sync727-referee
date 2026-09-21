import type { ChatMessage } from '../types';
import { stripThinkBlocks } from './text.ts';

/**
 * Completion of a streamed answer: decide what the user sees and what the
 * journal logs. A response that contains ONLY private think blocks is a
 * communication failure - the clean failure text is shown and logged, and
 * raw think markup is never stored in messages, journal, or logs.
 */
export function resolveResponseOutcome(response: string, commError: string): {
  answered: boolean;
  displayText: string;
  logAnswer: string;
} {
  const visible = stripThinkBlocks(response);
  const answered = visible.length > 0;
  return {
    answered,
    displayText: answered ? response : commError,
    logAnswer: answered ? visible : commError,
  };
}

/**
 * Fold a completed response into the message list. A streamed think-only
 * bubble is REPLACED by the clean failure text so no think markup survives
 * in history; otherwise the streamed bubble stays as-is.
 */
export function finalizeModelResponse(prev: ChatMessage[], response: string, commError: string): ChatMessage[] {
  const { answered, displayText } = resolveResponseOutcome(response, commError);
  const last = prev[prev.length - 1];
  if (last?.role === 'model') {
    if (!answered && stripThinkBlocks(last.text).length === 0) {
      return [...prev.slice(0, -1), { role: 'model', text: commError }];
    }
    return prev;
  }
  return [...prev, { role: 'model', text: displayText }];
}
