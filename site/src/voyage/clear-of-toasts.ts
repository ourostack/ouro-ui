/**
 * Once a toast has shown, scrolls the page just enough that `element` (what the toast is about, or
 * the control that raised it) sits clear above the toast stack, so a note never covers what it
 * talks about. The stack stays where HX puts it: at the foot of the screen, above the safe area.
 * A scroll already under way when the toast shows (the browser's own, bringing a tapped control
 * into view, say) can end with the element under the toast, so it checks again once the page has
 * come to rest.
 */
export function keepClearOfToasts(element: Element | null | undefined): void {
  if (!element) return;
  let done = false;
  /** Scrolls once a toast is laid out; false while there is none yet. `again`: only if the element is on the screen. */
  const clear = (again = false): boolean => {
    const viewport = document.querySelector<HTMLElement>('[data-ouro="toaster"]');
    const toasts = viewport ? [...viewport.querySelectorAll<HTMLElement>('[data-ouro="toast"]')].filter((toast) => toast.offsetHeight > 0) : [];
    if (!viewport || toasts.length === 0) return false;
    if (!done) {
      done = true;
      observer.disconnect();
      atRest(() => clear(true));
    }
    // Each toast rests on the stack's foot; the ones behind peek out above the front one.
    const stack = viewport.getBoundingClientRect();
    const tallest = Math.max(...toasts.map((toast) => toast.offsetHeight));
    const top = stack.bottom - tallest - 12 * (toasts.length - 1) - 12;
    const box = element.getBoundingClientRect();
    if (box.right <= stack.left || box.left >= stack.right) return true;
    // A reader who scrolled it off the screen meanwhile is not brought back to it.
    if (again && (box.bottom <= 0 || box.top >= stack.bottom)) return true;
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

/** Calls `then` once the page has not scrolled for three frames, giving up after two seconds. */
function atRest(then: () => void): void {
  const until = performance.now() + 2000;
  let last = scrollY;
  let still = 0;
  const frame = () => {
    still = scrollY === last ? still + 1 : 0;
    last = scrollY;
    if (still >= 3) then();
    else if (performance.now() < until) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const TOASTS = '[data-ouro="toaster"], [data-ouro="toast"]';

/** Whether a change is to the toast stack: a toast (or the stack) added, or a toast's own content changed. */
function touchesToasts(record: MutationRecord): boolean {
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(TOASTS)) return true;
  return [...record.addedNodes].some((node) => node instanceof Element && (node.matches(TOASTS) || node.querySelector(TOASTS) !== null));
}
