/**
 * share.ts — "ask from anywhere" helpers for a pure website (no PWA needed).
 *
 * WHAT: ask-links (/?ask=...) that open the site and auto-ask, outbound
 * sharing via the native sheet (Web Share API), an iPhone Safari bookmarklet,
 * and a clipboard offer. An OS share-sheet entry is impossible for a plain
 * website (Android reserves it for installed apps, iOS for native apps) —
 * this module is the website-compatible equivalent.
 */

export const ASK_PARAM = 'ask';
export const MAX_ASK_LEN = 1500;
export const APP_URL = 'https://fllref.abrdns.com';

const PENDING_ASK_KEY = 'pending_shared_question';

/** Link that opens the site and asks the given text automatically. */
export function buildAskUrl(text: string): string {
  return `${APP_URL}/?${ASK_PARAM}=${encodeURIComponent(text.trim().slice(0, MAX_ASK_LEN))}`;
}

/** Shared text from the current URL (?ask=), validated and capped. */
export function readAskParam(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get(ASK_PARAM) || '';
    return raw.trim().slice(0, MAX_ASK_LEN);
  } catch {
    return '';
  }
}

/** Remove ?ask= from the URL without touching other params. */
export function stripAskParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(ASK_PARAM)) return;
    url.searchParams.delete(ASK_PARAM);
    const rest = url.searchParams.toString();
    window.history.replaceState({}, '', url.pathname + (rest ? `?${rest}` : '') + url.hash);
  } catch {
    /* URL API unavailable — param simply stays */
  }
}

/** Tab-local stash so the question survives the login round-trip. */
export function stashPendingAsk(text: string): void {
  try {
    if (text.trim()) sessionStorage.setItem(PENDING_ASK_KEY, text.trim().slice(0, MAX_ASK_LEN));
  } catch {
    /* storage unavailable — ask-link simply won't survive */
  }
}

export function peekPendingAsk(): string {
  try {
    return (sessionStorage.getItem(PENDING_ASK_KEY) || '').trim().slice(0, MAX_ASK_LEN);
  } catch {
    return '';
  }
}

/** Take (and clear) the stashed question. */
export function takePendingAsk(): string {
  try {
    const value = sessionStorage.getItem(PENDING_ASK_KEY) || '';
    sessionStorage.removeItem(PENDING_ASK_KEY);
    return value.trim().slice(0, MAX_ASK_LEN);
  } catch {
    return '';
  }
}

/** A bare link carries no question — prefill it instead of auto-asking blind. */
export function isBareUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export type ShareOutcome = 'shared' | 'copied' | 'failed' | 'dismissed';

/** Share a ruling via the native sheet; fall back to copying the ask-link. */
export async function shareAskLink(question: string, title: string, body: string): Promise<ShareOutcome> {
  const url = buildAskUrl(question);
  const text = `${title}\n\n${body}`.slice(0, 2000);
  try {
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      await nav.share({ title, text, url });
      return 'shared';
    }
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError' || name === 'NotAllowedError') return 'dismissed';
    // Any other error: fall through to clipboard copy.
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Share the app itself via the native sheet, clipboard as fallback. */
export async function shareAppLink(title: string, text: string): Promise<ShareOutcome> {
  try {
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      await nav.share({ title, text, url: `${APP_URL}/` });
      return 'shared';
    }
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError' || name === 'NotAllowedError') return 'dismissed';
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${APP_URL}/`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * iPhone Safari bookmarklet: sends selected text (or page title + URL) to the
 * referee site. Saved as a bookmark, tapped from any page — no app needed.
 */
export const BOOKMARKLET_JS =
  "javascript:(function(){var t=((window.getSelection&&window.getSelection().toString())||'').trim()||(document.title+' '+location.href);location.href='https://fllref.abrdns.com/?ask='+encodeURIComponent(t.slice(0,1500));})();";
