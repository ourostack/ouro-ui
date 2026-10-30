/**
 * Once a toast has shown, scrolls the page just enough that `element` (what the toast is about, or
 * the control that raised it) sits clear above the toast stack, so a note never covers what it
 * talks about. The stack stays where HX puts it: at the foot of the screen, above the safe area.
 */
export function keepClearOfToasts(element: Element | null | undefined): void {
  if (!element) return;
  let done = false;
  /** Scrolls once a toast is laid out; false while there is none yet. */
  const clear = (): boolean => {
    const viewport = document.querySelector<HTMLElement>('[data-ouro="toaster"]');
    const toasts = viewport ? [...viewport.querySelectorAll<HTMLElement>('[data-ouro="toast"]')].filter((toast) => toast.offsetHeight > 0) : [];
    if (!viewport || toasts.length === 0) return false;
    done = true;
    observer.disconnect();
    // Each toast rests on the stack's foot; the ones behind peek out above the front one.
    const stack = viewport.getBoundingClientRect();
    const tallest = Math.max(...toasts.map((toast) => toast.offsetHeight));
    const top = stack.bottom - tallest - 12 * (toasts.length - 1) - 12;
    const box = element.getBoundingClientRect();
    if (box.right <= stack.left || box.left >= stack.right) return true;
    const overlap = box.bottom - top;
    if (overlap <= 0) return true;
    const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: overlap, behavior: instant ? "instant" : "smooth" });
    return true;
  };
  // The scroll starts as the toast mounts, before the frame that first paints it, so the toast is
  // never seen at rest over its subject; a slow page can take a second over that commit.
  const observer = new MutationObserver((records) => {
    if (!done && records.some(touchesToasts)) clear();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  setTimeout(() => observer.disconnect(), 1000);
  // A toast already showing (the same toast again, say) changes nothing the observer sees at
  // once: two frames, one for the toast to mount, one for it to be laid out.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!done) clear();
    }),
  );
}

const TOASTS = '[data-ouro="toaster"], [data-ouro="toast"]';

/** Whether a change is to the toast stack: a toast (or the stack) added, or a toast's own content changed. */
function touchesToasts(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(TOASTS)) return true;
  return [...record.addedNodes].some((node) => node instanceof Element && (node.matches(TOASTS) || node.querySelector(TOASTS) !== null));
}
