/**
 * Legacy chat-history cleanup.
 *
 * Chat history and the composer draft used to persist across refreshes in
 * this device's localStorage under `referee_chat_state_v1_<uid>`. The owner
 * later decided a refresh starts with a clean chat, so nothing is written
 * or read anymore; this module only wipes records left behind by older
 * versions - on first mount, sign-out, session kick, account deletion and
 * explicit conversation reset.
 */

const KEY_PREFIX = 'referee_chat_state_v1_';
const keyFor = (uid: string) => `${KEY_PREFIX}${uid}`;

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

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
