/**
 * Maps the referee's in-flight action to a ThinkingOrb state.
 * While the model's thinking block streams, Hebrew keywords reveal the
 * current stage (scanning the rulebook -> comparing & ruling -> drafting
 * the reply). Falls back to `working`, and `connecting` is used for the
 * pre-first-chunk window.
 */

/*
 * Keyword groups, ordered by the natural arc of a ruling:
 * - searching:  reading the rulebook / updates / images
 * - solving:    comparing, deciding, ruling on scoring
 * - composing:  drafting the final professional answer
 * The group whose keyword appears furthest into the stream wins, so the
 * orb advances search -> solve -> compose as thinking progresses.
 */
const GROUPS: { state: 'searching' | 'solving' | 'composing'; words: string[] }[] = [
  {
    state: 'searching',
    words: [
      'עיון', 'סריק', 'חוק', 'תמונות', 'עדכון', 'מסמך', 'בודק', 'מחפש',
      'לבדוק', 'check', 'scan', 'rule', 'update', 'look', 'read',
    ],
  },
  {
    state: 'solving',
    words: [
      'השווא', 'הכריע', 'מסקנ', 'פסק', 'ניקוד', 'החלט', 'סתיר', 'מגע הדדי',
      'decid', 'compar', 'verdict', 'ruling', 'score', 'conclud', 'weight',
    ],
  },
  {
    state: 'composing',
    words: [
      'תשובה', 'כתוב', 'נסח', 'מקצועית', 'תשובת', 'answer', 'compos', 'write', 'draft',
    ],
  },
];

/** Return the phase that best matches the streamed thinking text so far. */
export function thinkingOrbState(thinkText: string): 'searching' | 'solving' | 'composing' | 'working' {
  if (!thinkText) return 'working';
  const text = thinkText.toLowerCase();
  let best = -1;
  let bestState: 'working' | 'searching' | 'solving' | 'composing' = 'working';
  for (const group of GROUPS) {
    for (const word of group.words) {
      const idx = text.lastIndexOf(word);
      if (idx > best) {
        best = idx;
        bestState = group.state;
      }
    }
  }
  return bestState;
}