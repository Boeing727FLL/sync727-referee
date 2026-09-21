/**
 * Local-only chat history + composer draft persistence.
 *
 * PRIVACY POLICY: the conversation is personal. It is stored ONLY in this
 * device's localStorage (never synced to any cloud), bounded to the most
 * recent messages with per-message size caps, and wiped on sign-out,
 * session kick, account deletion and explicit conversation reset.
 * Attachment previews are object URLs that die with the page, so files are
 * never persisted - text only.
 */
import type { ChatMessage } from '../types';

/** Most recent messages kept across a refresh. */
export const HISTORY_MESSAGE_LIMIT = 50;

/** Per-message and per-draft size cap (characters). */
export const TEXT_CHAR_LIMIT = 4000;

const KEY_PREFIX = 'referee_chat_state_v1_';
const keyFor = (uid: string) => `${KEY_PREFIX}${uid}`;

export interface PersistedChatState {
  messages: ChatMessage[];
  draft: string;
  replyTo: { text: string } | null;
}

/**
 * Bound and sanitize live chat state for storage: last N messages, text
 * only (no attachment blobs, no in-flight progress flags), capped length.
 */
export function serializeChatState(state: PersistedChatState): PersistedChatState {
  const messages = state.messages
    .slice(-HISTORY_MESSAGE_LIMIT)
    .map((m) => {
      const clean: ChatMessage = { role: m.role, text: m.text.slice(0, TEXT_CHAR_LIMIT) };
      if (m.quote) clean.quote = m.quote.slice(0, TEXT_CHAR_LIMIT);
      return clean;
    });
  return {
    messages,
    draft: (state.draft || '').slice(0, TEXT_CHAR_LIMIT),
    replyTo: state.replyTo ? { text: state.replyTo.text.slice(0, TEXT_CHAR_LIMIT) } : null,
  };
}

/** Parse a stored payload; anything malformed or wrong-shaped is dropped. */
export function parseChatState(raw: string | null): PersistedChatState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.messages)) return null;
    const messages: ChatMessage[] = [];
    for (const m of data.messages) {
      if (!m || (m.role !== 'user' && m.role !== 'model') || typeof m.text !== 'string') return null;
      const clean: ChatMessage = { role: m.role, text: m.text };
      if (typeof m.quote === 'string') clean.quote = m.quote;
      messages.push(clean);
    }
    const draft = typeof data.draft === 'string' ? data.draft : '';
    const replyTo = data.replyTo && typeof data.replyTo.text === 'string' ? { text: data.replyTo.text } : null;
    return { messages, draft, replyTo };
  } catch {
    return null;
  }
}

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Load this user's persisted chat on this device (null when absent). */
export function loadChatState(uid: string): PersistedChatState | null {
  const store = storage();
  if (!store) return null;
  return parseChatState(store.getItem(keyFor(uid)));
}

/** Persist the current chat state (best effort: quota errors stay silent). */
export function saveChatState(uid: string, state: PersistedChatState): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(keyFor(uid), JSON.stringify(serializeChatState(state)));
  } catch { /* storage full or blocked: history is a convenience, not data */ }
}

/** Wipe one user's persisted chat on this device. */
export function clearChatState(uid: string): void {
  const store = storage();
  if (!store) return;
  try { store.removeItem(keyFor(uid)); } catch { /* ignore */ }
}

/** Wipe EVERY user's persisted chat on this device (sign-out, kick, delete). */
export function clearAllChatStates(): void {
  const store = storage();
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(KEY_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => store.removeItem(k));
  } catch { /* ignore */ }
}
