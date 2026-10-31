import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

export { holdPageAtPress, holdPageScroll };

// What the person does to scroll the page: these leave a scroll that follows them alone.
// A key counts only when nothing handled it, so the arrow keys that move through a menu don't.
const scrollKeys = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"]);

/** How long after the person acts a page scroll is theirs, in milliseconds. */
const INTENT_MS = 1000;
/** How long a scroll of theirs that is still going keeps the page free, in milliseconds. */
const SCROLLING_MS = 200;
/**
 * How long a press on a trigger holds the page when no popup opens from it, in milliseconds.
 * @claim "How long a press on a trigger holds the page when no popup opens from it" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > makes the page's scrolls instant and holds the page from the press, until a second passes with no popup)
 */
const PRESS_MS = 1000;
/** The keys that open a menu, popover, select or combobox from its trigger. */
const openingKeys = new Set(["Enter", " ", "ArrowDown", "ArrowUp"]);

const portals = new Set<HTMLElement>();
let left = 0;
let top = 0;
let freeUntil = 0;
let release: (() => void) | undefined;
/** Ends the hold a press on a trigger started, until a popup takes it over. */
let pressEnds: ReturnType<typeof setTimeout> | undefined;
/** The key that pressed a trigger: the person opening a popup with it, not scrolling. */
let pressKey: KeyboardEvent | undefined;
/** The page's own inline `scroll-behavior` while the hold has made its scrolls instant, else null. */
let behavior: string | null = null;

/**
 * Makes the page's scrolls instant. A smooth scroll's first step can reach the screen before its
 * scroll event, so one the hold undoes would show for a frame; an instant one is undone first.
 *
 * @claim "an instant one is undone first" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageScroll > undoes a page scroll while a popup is open, before the next frame paints it)
 */
function pin(html: HTMLElement) {
  behavior ??= html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
}

/** Gives the page its own `scroll-behavior` back, unless something else has set it since. */
function unpin(html: HTMLElement) {
  if (behavior !== null && html.style.scrollBehavior === "auto") html.style.scrollBehavior = behavior;
  behavior = null;
}

/** Whether the page is held: a trigger was just pressed, or a portal holds a popup Base UI marks open, not one that is closing. */
const held = () => pressEnds !== undefined || [...portals].some((portal) => portal.querySelector("[data-open]") !== null);

/** Starts listening, from where the page is now, unless a popup or a press already holds it. */
function start(view: Window) {
  if (portals.size > 0 || pressEnds !== undefined) return;
  left = view.scrollX;
  top = view.scrollY;
  release = listen(view);
}

/**
 * Stops listening and gives the page its scrolls back, once no popup and no press holds it.
 * @claim "once no popup and no press holds it" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > holds the page while a press is pending, though the popup that was open closes)
 */
function stop(view: Window) {
  if (portals.size > 0 || pressEnds !== undefined) return;
  release!();
  unpin(view.document.documentElement);
}

/**
 * Ends a press's hold: a popup took it over, or none opened in time.
 * @claim "a popup took it over, or none opened in time" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > hands the press's hold to the popup that opens from it, from where the press stopped the page)
 * @claim "a popup took it over, or none opened in time" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > makes the page's scrolls instant and holds the page from the press, until a second passes with no popup)
 */
function endPress() {
  clearTimeout(pressEnds);
  pressEnds = undefined;
}

/**
 * Holds the page from a press on a trigger, before its popup opens: stops a page scroll in flight
 * where it is, and makes the page's scrolls instant, until the popup takes the hold over or, when
 * none opens, a second later. A press on the trigger of an open popup, which closes it, leaves the
 * page to that popup's hold.
 *
 * @claim "stops a page scroll in flight where it is" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > stops a smooth scroll in flight where it is, at a press of the primary button or an opening key)
 * @claim "when none opens, a second later" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > makes the page's scrolls instant and holds the page from the press, until a second passes with no popup)
 * @claim "until the popup takes the hold over" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > hands the press's hold to the popup that opens from it, from where the press stopped the page)
 * @claim "A press on the trigger of an open popup" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > leaves the page to the open popup's hold at a press on its trigger, which closes it)
 */
function press(trigger: HTMLElement) {
  if (trigger.getAttribute("aria-expanded") === "true") return;
  const view = trigger.ownerDocument.defaultView!;
  // Stryker disable next-line ObjectLiteral: scrollTo({}) also scrolls to where the page is, which ends a smooth scroll in flight there too; the place and the instant behaviour are spelled out so that does not rest on the page's scroll-behavior.
  view.scrollTo({ left: view.scrollX, top: view.scrollY, behavior: "instant" });
  start(view);
  endPress();
  pressEnds = setTimeout(() => {
    pressEnds = undefined;
    stop(view);
  }, PRESS_MS);
  freeUntil = 0;
  pin(view.document.documentElement);
}

/**
 * Event props for the trigger of a menu, popover, select or combobox, which hold the page from
 * the press that opens it (the primary button's pointerdown, or Enter, Space or an up or down
 * arrow) rather than from when its popup opens. A press during a smooth scroll stops the page
 * where it is at once, so a popup that opens on pointerdown does not take the release, over
 * whatever moved under the pointer, for a press outside it and close. Spread them on the trigger,
 * with `holdPage` on its `usePortalContainer`.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * <BaseMenu.Trigger render={trigger} {...holdPageAtPress} />
 * @claim "A press during a smooth scroll stops the page where it is at once" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageAtPress > stops a smooth scroll in flight where it is, at a press of the primary button or an opening key)
 * @claim "so a popup that opens on pointerdown does not take the release" registry/ouro/components/ouro/menu/menu.test.tsx verify:fileLine(registry/ouro/components/ouro/menu/menu.test.tsx, /stays open and stops the page where it is, pressed mid-scroll/)
 */
const holdPageAtPress = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button === 0) press(event.currentTarget);
  },
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!openingKeys.has(event.key)) return;
    pressKey = event.nativeEvent;
    press(event.currentTarget);
  },
};

/**
 * Keeps the page where it is while an overlay in `portal` is open. Opening a menu, popover,
 * select or combobox focuses and scrolls to its items, and a browser scrolls the page for that
 * too: far, when the popup is not placed yet or the page sets `scroll-padding`, and smoothly,
 * when it sets `scroll-behavior: smooth`. While a popup is open, such a scroll is undone before
 * it is painted, and the page's scrolls are instant (`scroll-behavior: auto` on `<html>`) so
 * none shows a first step. A scroll the person makes still moves the page: with the wheel, a touch, the
 * scroll bar, a key nothing else handled, or a click on something in the popup (a link to a
 * section, say). Returns what stops holding the page for this portal.
 *
 * Internal: Ouro UI components use it, through `usePortalContainer`; apps don't need to.
 *
 * @example
 * const stop = holdPageScroll(portalElement);
 * @claim "such a scroll is undone before it is painted" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageScroll > undoes a page scroll while a popup is open, before the next frame paints it)
 * @claim "the page's scrolls are instant" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageScroll > makes the page's scrolls instant while it holds the page, and gives back its own scroll-behavior after)
 * @claim "A scroll the person makes still" registry/ouro/lib/ouro/page-scroll-hold.test.ts verify:testExists(registry/ouro/lib/ouro/page-scroll-hold.test.ts::holdPageScroll > leaves a scroll that follows the wheel, a touch, the scroll bar, a key nothing handled or a click in the popup)
 */
function holdPageScroll(portal: HTMLElement): () => void {
  const view = portal.ownerDocument.defaultView!;
  // From where the page is, or, when a press on its trigger held it first, from where the press stopped it.
  start(view);
  endPress();
  // A popup that opens now was opened by what the person just did; what it scrolls is not theirs.
  freeUntil = 0;
  pin(view.document.documentElement);
  portals.add(portal);
  return () => {
    portals.delete(portal);
    stop(view);
  };
}

function listen(view: Window): () => void {
  const document = view.document;
  // What the person starts glides as the page sets it.
  const free = () => {
    freeUntil = performance.now() + INTENT_MS;
    unpin(document.documentElement);
  };
  const onPointerDown = (event: PointerEvent) => {
    // The scroll bar, or a middle-button press that starts the browser's autoscroll.
    if (event.target === document.documentElement || event.button === 1) free();
  };
  const onClick = (event: MouseEvent) => {
    if ([...portals].some((portal) => portal.contains(event.target as Node))) free();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event === pressKey) return;
    if (event.defaultPrevented) {
      freeUntil = 0;
      pin(document.documentElement);
    } else if (scrollKeys.has(event.key)) free();
  };
  const onScroll = () => {
    const now = performance.now();
    const theirs = now < freeUntil;
    if (theirs) freeUntil = Math.max(freeUntil, now + SCROLLING_MS);
    if (theirs || !held()) {
      left = view.scrollX;
      top = view.scrollY;
      return;
    }
    // Back where it was, at once: a scroll to where the page already is does nothing.
    view.scrollTo({ left, top, behavior: "instant" });
  };
  const capture = {
    capture: true,
    // Stryker disable next-line BooleanLiteral: passive only tells the browser the listener never cancels the event, which none does.
    passive: true,
  };
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
