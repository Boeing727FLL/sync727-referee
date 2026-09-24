/**
 * Private model-reasoning markup (`<think>...</think>`) must never reach
 * display, logs or team history. The model streams these tags as plain text,
 * so the tags here are tolerant of the shapes a live stream actually
 * produces: case/whitespace variants (`<THINK>`, `</ think >`), blocks whose
 * closing tag never arrived (truncated or errored streams), closing tags
 * whose opener was lost, and a stream that ended in the middle of the tag
 * itself. Models also drop the closing bracket (`<think` / `</think` alone
 * on a line - seen live on 2026-09-23), so the `>` is optional when the tag
 * name is followed by whitespace or the end of the text.
 */
const TAG_END = '(?:\\s*>|(?=\\s)|$)';
const OPEN = `<\\s*think(?:ing)?${TAG_END}`;
const CLOSE = `<\\s*\\/\\s*think(?:ing)?${TAG_END}`;
export const THINK_OPEN_RE = new RegExp(OPEN, 'i');
export const THINK_CLOSE_RE = new RegExp(CLOSE, 'i');
const COMPLETE_BLOCK_RE = new RegExp(`${OPEN}[\\s\\S]*?${CLOSE}`, 'gi');
const UNCLOSED_OPEN_RE = new RegExp(`${OPEN}[\\s\\S]*$`, 'gi');
const ORPHAN_CLOSE_RE = new RegExp(`^[\\s\\S]*?${CLOSE}`, 'i');
// A strict prefix of `<think>` / `</think>` at the very end of the text:
// the stream died mid-tag, so the fragment is markup, never answer text.
const TRAILING_FRAGMENT_RE = /<\s*\/?\s*(?:t|th|thi|thin|think|thinki|thinkin|thinking)?\s*$/i;

/**
 * Follow-up suggestions (v12 chips): the model ends its answer with a
 * `<followups>` block of short next questions, one per line. The block is
 * UI data, never answer text - stripped everywhere the think block is, and
 * read back only by extractFollowUps.
 */
const FU_OPEN = '<\\s*follow-?ups?\\s*>';
const FU_CLOSE = '<\\s*\\/\\s*follow-?ups?\\s*>';
const FU_BLOCK_RE = new RegExp(`${FU_OPEN}([\\s\\S]*?)(?:${FU_CLOSE}|$)`, 'i');
const FU_STRIP_RE = new RegExp(`${FU_OPEN}[\\s\\S]*$`, 'i');
const FU_TRAILING_RE = /<\s*(?:f|fo|fol|foll|follo|follow|follow-|followu|followup|followups)?\s*$/i;

/** Remove the follow-up block (complete, unclosed, or a stream cut mid-tag). */
export const stripFollowUpBlock = (text: string): string =>
  (text || '').replace(FU_STRIP_RE, '').replace(new RegExp(FU_CLOSE, 'gi'), '').replace(FU_TRAILING_RE, '');

/** The model's suggested follow-up questions (max 3), only once the block closed. */
export const extractFollowUps = (text: string): string[] => {
  const src = text || '';
  if (!new RegExp(FU_CLOSE, 'i').test(src)) return [];
  const m = src.match(FU_BLOCK_RE);
  if (!m) return [];
  const seen = new Set<string>();
  return m[1]
    .split(/\n+/)
    .map(line => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').replace(/[*_`#<>]/g, '').trim())
    .filter(line => line.length >= 3 && line.length <= 120)
    .filter(line => (seen.has(line) ? false : (seen.add(line), true)))
    .slice(0, 3);
};

/** Remove private model-reasoning blocks before display, logs or team history. */
export const stripThinkBlocks = (text: string): string => {
  let out = stripFollowUpBlock(text || '');
  // Complete reasoning blocks; loop so adjacent/nested shapes all go.
  let prev: string;
  do {
    prev = out;
    out = out.replace(COMPLETE_BLOCK_RE, '');
  } while (out !== prev);
  // An opening tag that was never closed hides everything after it.
  out = out.replace(UNCLOSED_OPEN_RE, '');
  // A closing tag whose opener is missing marks everything before it as
  // reasoning (e.g. a stream that resumed mid-block).
  while (THINK_CLOSE_RE.test(out)) {
    const next = out.replace(ORPHAN_CLOSE_RE, '');
    if (next === out) break;
    out = next;
  }
  // A truncated stream can end mid-tag; never show the fragment.
  out = out.replace(TRAILING_FRAGMENT_RE, '');
  return out.trim();
};
