/**
 * askRulebook result contract - the ONLY three outcomes a caller handles:
 *
 * 1. resolves ASK_ABORTED ('')  -> the request was aborted (Stop pressed /
 *    session kicked). The caller must not render, count, or log anything.
 * 2. resolves a non-empty string -> user-visible answer text. This includes
 *    the honest Hebrew fallback messages for quota/technical failures and
 *    the rulebook-incomplete notice: those are answers the user reads, so
 *    they are resolved, never thrown.
 * 3. never rejects for expected failures; a rejection means a programmer
 *    error and may crash to the boundary.
 *
 * Why '' instead of null: the streaming chunks already flowed into the UI;
 * the completion value only decides whether the finished text counts as an
 * answer. The empty string is the historical sentinel, named here so no
 * call site has to guess what it means.
 */
export const ASK_ABORTED = '';

/** True when a resolved askRulebook value means "aborted, ignore it". */
export const isAbortResult = (response: string): boolean => response === ASK_ABORTED;
