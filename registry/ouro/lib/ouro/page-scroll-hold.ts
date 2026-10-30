export { holdPageScroll };

// What the person does to scroll the page: these leave a scroll that follows them alone.
// A key counts only when nothing handled it, so the arrow keys that move through a menu don't.
const scrollKeys = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"]);

/** How long after the person acts a page scroll is theirs, in milliseconds. */
const INTENT_MS = 1000;
/** How long a scroll of theirs that is still going keeps the page free, in milliseconds. */
const SCROLLING_MS = 200;

const portals = new Set<HTMLElement>();
let left = 0;
let top = 0;
let freeUntil = 0;
let release: (() => void) | undefined;

/** Whether an overlay is open: a portal holds a popup Base UI marks open, not one that is closing. */
const held = () => [...portals].some((portal) => portal.querySelector("[data-open]") !== null);

/**
 * Keeps the page where it is while an overlay in `portal` is open. Opening a menu, popover,
 * select or combobox focuses and scrolls to its items, and a browser scrolls the page for that
 * too: far, when the popup is not placed yet or the page sets `scroll-padding`, and smoothly,
 * when it sets `scroll-behavior: smooth`. While a popup is open, such a scroll is undone before
 * it is painted. A scroll the person makes still moves the page: with the wheel, a touch, the
 * scroll bar, a key nothing else handled, or a click on something in the popup (a link to a
 * section, say). Returns what stops holding the page for this portal.
 *
 * Internal: Ouro UI components use it, through `usePortalContainer`; apps don't need to.
 *
 * @example
 * const stop = holdPageScroll(portalElement);
 * @claim "such a scroll is undone before it is painted" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageScroll > undoes a page scroll while a popup is open, before the next frame paints it)
 * @claim "A scroll the person makes still" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageScroll > leaves a scroll that follows the wheel, a touch, the scroll bar, a key nothing handled or a click in the popup)
 */
function holdPageScroll(portal: HTMLElement): () => void {
  const view = portal.ownerDocument.defaultView!;
  if (portals.size === 0) {
    left = view.scrollX;
    top = view.scrollY;
    release = listen(view);
  }
  // A popup that opens now was opened by what the person just did; what it scrolls is not theirs.
  freeUntil = 0;
  portals.add(portal);
  return () => {
    portals.delete(portal);
    if (portals.size === 0) release!();
  };
}

function listen(view: Window): () => void {
  const document = view.document;
  const free = () => {
    freeUntil = performance.now() + INTENT_MS;
  };
  const onPointerDown = (event: PointerEvent) => {
    // The scroll bar, or a middle-button press that starts the browser's autoscroll.
    if (event.target === document.documentElement || event.button === 1) free();
  };
  const onClick = (event: MouseEvent) => {
    if ([...portals].some((portal) => portal.contains(event.target as Node))) free();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) freeUntil = 0;
    else if (scrollKeys.has(event.key)) free();
  };
  const onScroll = () => {
    const now = performance.now();
    if (now < freeUntil || !held()) {
      left = view.scrollX;
      top = view.scrollY;
      if (now < freeUntil) freeUntil = Math.max(freeUntil, now + SCROLLING_MS);
      return;
    }
    if (view.scrollX !== left || view.scrollY !== top) view.scrollTo({ left, top, behavior: "instant" });
  };
  const capture = { capture: true, passive: true };
  document.addEventListener("wheel", free, capture);
  document.addEventListener("touchmove", free, capture);
  document.addEventListener("pointerdown", onPointerDown, capture);
  document.addEventListener("click", onClick, capture);
  // Bubbling, on the window: after the popup's own handlers, which mark the keys they used.
  view.addEventListener("keydown", onKeyDown);
  document.addEventListener("scroll", onScroll);
  return () => {
    document.removeEventListener("wheel", free, capture);
    document.removeEventListener("touchmove", free, capture);
    document.removeEventListener("pointerdown", onPointerDown, capture);
    document.removeEventListener("click", onClick, capture);
    view.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("scroll", onScroll);
  };
}
