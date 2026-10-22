/**
 * Once a toast has shown, scrolls the page just enough that `element` (what the toast is about, or
 * the control that raised it) sits clear above the toast stack, so a note never covers what it
 * talks about. The stack stays where HX puts it: at the foot of the screen, above the safe area.
 */
export function keepClearOfToasts(element: Element | null | undefined): void {
  if (!element) return;
  // The toast mounts in a later commit, which a busy page (an island hydrating) can hold for some
  // frames, so each frame looks again, for up to a second.
  let frames = 60;
  const clear = () => {
    const viewport = document.querySelector<HTMLElement>('[data-ouro="toaster"]');
    const toasts = viewport ? [...viewport.querySelectorAll<HTMLElement>('[data-ouro="toast"]')].filter((toast) => toast.offsetHeight > 0) : [];
    if (!viewport || toasts.length === 0) {
      if (--frames > 0) requestAnimationFrame(clear);
      return;
    }
    // Each toast rests on the stack's foot; the ones behind peek out above the front one.
    const stack = viewport.getBoundingClientRect();
    const tallest = Math.max(...toasts.map((toast) => toast.offsetHeight));
    const top = stack.bottom - tallest - 12 * (toasts.length - 1) - 12;
    const box = element.getBoundingClientRect();
    if (box.right <= stack.left || box.left >= stack.right) return;
    const overlap = box.bottom - top;
    if (overlap <= 0) return;
    const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: overlap, behavior: instant ? "instant" : "smooth" });
  };
  // Two frames: one for the toast to mount, one for it to be laid out.
  requestAnimationFrame(() => requestAnimationFrame(clear));
}
