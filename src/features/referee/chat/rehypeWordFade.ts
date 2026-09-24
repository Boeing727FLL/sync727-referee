import type { Element, ElementContent, Root, RootContent } from 'hast';

/**
 * While an answer is being written, wrap each word in <span class="tw">.
 * React keeps the spans it already rendered (same position), so only the
 * newly revealed words mount and play the short CSS fade-in - the answer
 * looks like it is being written live, word by word, like desktop chat AIs.
 * Code blocks are left alone.
 */
export function rehypeWordFade() {
  return (tree: Root) => { walk(tree); };
}

const SKIP = new Set(['code', 'pre']);

function walk(node: Root | Element) {
  const out: (RootContent | ElementContent)[] = [];
  for (const child of node.children) {
    if (child.type === 'text') {
      for (const part of child.value.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) out.push({ type: 'text', value: part });
        else out.push({ type: 'element', tagName: 'span', properties: { className: ['tw'] }, children: [{ type: 'text', value: part }] });
      }
    } else {
      if (child.type === 'element' && !SKIP.has(child.tagName)) walk(child);
      out.push(child);
    }
  }
  node.children = out as typeof node.children;
}
