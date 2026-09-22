/** Focus-trap semantics of the shared modal a11y helper. */
import './helpers/dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabCycleTarget, focusableItems } from '../src/lib/modalA11y.ts';

function panel(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

test('tab on the last control wraps to the first', () => {
  const p = panel('<button id="a">a</button><button id="b">b</button><input id="c" />');
  const target = tabCycleTarget(p, p.querySelector('#c'), false);
  assert.equal((target as HTMLElement).id, 'a');
  p.remove();
});

test('shift+tab on the first control wraps to the last', () => {
  const p = panel('<button id="a">a</button><button id="b">b</button><input id="c" />');
  const target = tabCycleTarget(p, p.querySelector('#a'), true);
  assert.equal((target as HTMLElement).id, 'c');
  p.remove();
});

test('tab in the middle of the panel lets the browser move naturally', () => {
  const p = panel('<button id="a">a</button><button id="b">b</button><input id="c" />');
  assert.equal(tabCycleTarget(p, p.querySelector('#a'), false), null);
  assert.equal(tabCycleTarget(p, p.querySelector('#b'), true), null);
  p.remove();
});

test('focus outside the panel is pulled back in, both directions', () => {
  const p = panel('<button id="a">a</button><button id="b">b</button>');
  const outside = document.createElement('button');
  document.body.appendChild(outside);
  assert.equal((tabCycleTarget(p, outside, false) as HTMLElement).id, 'a');
  assert.equal((tabCycleTarget(p, outside, true) as HTMLElement).id, 'b');
  assert.equal((tabCycleTarget(p, null, false) as HTMLElement).id, 'a');
  p.remove(); outside.remove();
});

test('a panel with no controls traps focus on the panel itself', () => {
  const p = panel('<p>no controls here</p>');
  p.tabIndex = -1;
  assert.equal(tabCycleTarget(p, null, false), p);
  p.remove();
});

test('disabled buttons are not focus stops', () => {
  const p = panel('<button id="a">a</button><button disabled id="b">b</button><button id="c">c</button>');
  assert.deepEqual(focusableItems(p).map(el => el.id), ['a', 'c']);
  p.remove();
});
