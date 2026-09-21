/**
 * Private model-reasoning markup (`<think>...</think>`) must never reach
 * display, logs or team history. The model streams these tags as plain text,
 * so the tags here are tolerant of the shapes a live stream actually
 * produces: case/whitespace variants (`<THINK>`, `</ think >`), blocks whose
 * closing tag never arrived (truncated or errored streams), closing tags
 * whose opener was lost, and a stream that ended in the middle of the tag
 * itself.
 */
export const THINK_OPEN_RE = /<\s*think\s*>/i;
export const THINK_CLOSE_RE = /<\s*\/\s*think\s*>/i;

const OPEN = '<\\s*think\\s*>';
const CLOSE = '<\\s*\\/\\s*think\\s*>';
const COMPLETE_BLOCK_RE = new RegExp(`${OPEN}[\\s\\S]*?${CLOSE}`, 'gi');
const UNCLOSED_OPEN_RE = new RegExp(`${OPEN}[\\s\\S]*$`, 'gi');
const ORPHAN_CLOSE_RE = new RegExp(`^[\\s\\S]*?${CLOSE}`, 'i');
// A strict prefix of `<think>` / `</think>` at the very end of the text:
// the stream died mid-tag, so the fragment is markup, never answer text.
const TRAILING_FRAGMENT_RE = /<\s*\/?\s*(?:t|th|thi|thin|think)?\s*$/i;

/** Remove private model-reasoning blocks before display, logs or team history. */
export const stripThinkBlocks = (text: string): string => {
  let out = text || '';
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
