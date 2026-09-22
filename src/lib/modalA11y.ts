/**
 * Shared modal accessibility: one behavior for every dialog in the app.
 *
 * - Escape closes (when the modal allows dismissal; mandatory gates pass
 *   no onEscape and keep their focus trap).
 * - Tab / Shift+Tab cycle inside the panel; focus never falls out to the
 *   page behind while the modal is open.
 * - Focus lands on the first control when the modal opens and returns to
 *   the element that opened it when the modal unmounts.
 *
 * The focus-cycle decision is a pure function so the trap is testable
 * without a browser.
 */
import { useCallback, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true');
}

/**
 * Where Tab should move focus inside a modal. Returns the element to
 * focus, or null to let the browser handle the key (focus is already
 * cycling naturally inside the panel).
 */
export function tabCycleTarget(container: HTMLElement, active: Element | null, shiftKey: boolean): HTMLElement | null {
  const items = focusableItems(container);
  if (!items.length) return container;
  const inside = active !== null && container.contains(active);
  if (shiftKey && (!inside || active === items[0])) return items[items.length - 1];
  if (!shiftKey && (!inside || active === items[items.length - 1])) return items[0];
  return null;
}

export function useModalA11y(onEscape?: () => void): (node: HTMLElement | null) => void {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const cleanupRef = useRef<(() => void) | null>(null);
  // Callback ref: fires with the panel node when AnimatePresence mounts it
  // and with null when it unmounts, so focus and the key listener track the
  // panel's real lifecycle (an effect keyed on isOpen would miss it).
  return useCallback((node: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = focusableItems(node)[0];
    (first || node).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (escapeRef.current) {
          event.stopPropagation();
          escapeRef.current();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const target = tabCycleTarget(node, document.activeElement, event.shiftKey);
      if (target) {
        event.preventDefault();
        target.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    cleanupRef.current = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);
}
