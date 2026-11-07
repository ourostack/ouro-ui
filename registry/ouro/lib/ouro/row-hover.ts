"use client";

import { createContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { lastInput } from "@/registry/ouro/lib/ouro/last-input";

/** How the shared layer came to its row: a mouse or pen over it, keyboard focus in it, or a tap on it. */
export type RowHoverVia = "pointer" | "focus" | "touch";

/**
 * A list's rows and what the layer shows on a row: a row sets its data as it renders and deletes
 * it as it goes, and the list's layer reads the data of the row it is on.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 */
export interface RowLayer<T> {
  /** Sets a row's data: the row takes the layer. */
  set(row: Element, data: T): void;
  /** Takes the row out of the layer. */
  delete(row: Element): void;
  /** A row's data, if it takes the layer. */
  get(row: Element): T | undefined;
  /** Calls `listener` with a row whenever its data is set or deleted; returns the function that stops it. */
  listen(listener: (row: Element) => void): () => void;
}

/**
 * Makes a list's {@link RowLayer}. `onFirstRow` runs once, as the first row takes the layer, so a
 * list loads the layer's code only when a row needs it.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * const [layer] = useState(() => createRowLayer<BarData>(() => void loadBar().then(setBar)));
 */
export function createRowLayer<T>(onFirstRow?: () => void): RowLayer<T> {
  const rows = new WeakMap<Element, T>();
  const listeners = new Set<(row: Element) => void>();
  const tell = (row: Element) => listeners.forEach((listener) => listener(row));
  let first = onFirstRow;
  return {
    set: (row, data) => {
      rows.set(row, data);
      first?.();
      first = undefined;
      tell(row);
    },
    delete: (row) => (rows.delete(row), tell(row)),
    get: (row) => rows.get(row),
    listen: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
  };
}

/**
 * The layer of the list a row is in, which its rows register with; null outside such a list.
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * const layer = useContext(RowLayerContext);
 */
export const RowLayerContext = createContext<RowLayer<unknown> | null>(null);

/** Where the app's menu for a row opens: at the pointer, or at the row itself (from the keyboard). */
export type RowMenuAt = { x: number; y: number } | null;

/** What {@link useRowHover} returns: the row the layer is on, and how to put it away. */
export interface RowHover {
  /** The row the layer is on, or null while it is hidden. */
  row: HTMLElement | null;
  /** How it came there; null while it is hidden. */
  via: RowHoverVia | null;
  /** Hides the layer until a pointer or keyboard focus next arrives at a row. */
  hide: () => void;
  /** While held (a menu for a row is open), the layer stays hidden, whatever the pointer does. */
  hold: (held: boolean) => void;
}

// What a tap lands on that is the control's rather than the row's.
const controls = "a, button, input, textarea, select, [tabindex]";
// Where a mouse or pen last was in the page, for a layer that arrives under one resting still: the page's hover state
// can lag a list that was just drawn, and a pointer that stays still makes no move of its own.
let pointerAt: { x: number; y: number } | null = null;
// The events of a pointer that has not moved: as the page changes under a resting mouse, the browser hit-tests it again
// and sends pointerover (WebKit, a moment later, pointermove too) where it already was. The page moved, not the person.
const resting = new WeakSet<Event>();
const still = (event: PointerEvent) => event.clientX === pointerAt?.x && event.clientY === pointerAt.y;
// Stryker disable next-line ConditionalExpression,StringLiteral: on a server there is no page to listen to, and every browser the tests run in has a document, so the server branch cannot be reached.
if (typeof document !== "undefined") {
  // Captured, so the list's own listeners, which run later, know.
  document.addEventListener("pointerover", (event) => void (still(event) && resting.add(event)), {
    capture: true,
    // Stryker disable next-line BooleanLiteral: passive only tells the browser the listener never cancels the event.
    passive: true,
  });
  document.addEventListener(
    "pointermove",
    (event) => {
      // Stryker disable next-line ConditionalExpression,CallExpression: Chromium, where the mutants run, sends no pointermove for a pointer that has not moved; the WebKit runs of the tests hold it.
      if (still(event)) resting.add(event);
      // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: a finger leaves nothing resting; no browser test can move a touch pointer without lifting it.
      pointerAt = event.pointerType === "touch" ? null : { x: event.clientX, y: event.clientY };
    },
    // Stryker disable next-line ObjectLiteral,BooleanLiteral: capture marks WebKit's pointermove for a pointer that has not moved before the list sees it, which Chromium, where the mutants run, never sends (the WebKit runs of the tests hold it); passive only says the listener never cancels the event.
    { capture: true, passive: true },
  );
}

// Where a right-click stays the browser's: a field's own menu (spelling, paste).
const editable = 'input, textarea, [contenteditable]:not([contenteditable="false"])';
// A link's, a picture's or a video's own menu (copy its address, save it) stays the browser's too.
const ownMenu = `${editable}, a[href], img, video`;

/**
 * One layer for a whole list, such as the action bar over the message the pointer is on: the list
 * renders it once, on the row this returns, rather than one per row. It listens once, on the list
 * (`pointerover` and `pointerleave` delegated from the rows, focus, keys, scrolling, a tap and the
 * window's blur), so a list of a thousand rows costs what a list of one does, and the layer is on
 * at most one row at a time. A mouse or pen over a row shows it there at once (in the same event,
 * before the next frame), and moving off the row or the list hides it; a pointer already resting on a row when the
 * layer arrives shows it there too. A pointer that has not moved takes nothing: the events a browser sends for a resting
 * pointer as the page changes under it neither move nor hide the layer, which goes to the pointer once it moves. Keyboard focus arriving in
 * a row shows it too, and Escape hides it, putting focus back on the row if it was in the layer; an Escape in a
 * field in the row is the field's.
 * A tap on a row shows it until a press lands elsewhere. Scrolling under the pointer, the window
 * losing focus and the row going all hide it, so it never stays on a row the pointer has left.
 * `menu` opens the app's menu for a row: right-click (except on a field, a link, a picture, a video or over
 * selected text, whose menus stay the browser's), Shift+F10 or the context-menu key on a focused row. It returns
 * whether it opened one; when it returns false, the right-click goes to the browser's menu. The layer is hidden
 * while that menu is open (`hold`). The rows are the elements whose data the layer
 * holds (`RowLayer`).
 *
 * Internal: Ouro UI components use it; apps don't need to.
 *
 * @example
 * const hover = useRowHover(scrollerRef, layer, { menu: (row, at) => openMenu(row, at) });
 * return hover.row && createPortal(<Bar row={hover.row} />, slotOf(hover.row));
 * @claim "It listens once, on the list" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > adds the same listeners for a thousand rows as for one)
 * @claim "the layer is on at most one row at a time" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > follows the pointer from row to row, on one row at a time, and hides when it leaves a row or the list)
 * @claim "before the next frame" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > shows the layer within the pointer's own event, before the next frame)
 * @claim "an Escape in a field in the row is the field's" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > shows on keyboard focus, not on a click's, and Escape hides it with focus back on the row)
 * @claim "a pointer already resting on a row when the" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > shows on a row focused from the keyboard, or the pointer rests on, before the layer arrived)
 * @claim "A pointer that has not moved takes nothing" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > takes nothing from a pointer that has not moved: the page changing under it neither moves nor hides the layer, until it moves)
 * @claim "Keyboard focus arriving in a row shows it too" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > shows on keyboard focus, not on a click's, and Escape hides it with focus back on the row)
 * @claim "A tap on a row shows it until" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > shows on a tap until a press lands elsewhere, and a tap on a control is the control's)
 * @claim "Scrolling under the pointer, the window" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > hides on a scroll until the pointer moves again, on the window's blur and when the row goes)
 * @claim "when it returns false, the right-click goes" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > opens the menu on right-click, Shift+F10 and the context-menu key, and leaves fields, links and selected text to the browser)
 * @claim "`menu` opens the app's menu for a row" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > opens the menu on right-click, Shift+F10 and the context-menu key, and leaves fields, links and selected text to the browser)
 */
export function useRowHover<T>(
  container: RefObject<HTMLElement | null>,
  layer: RowLayer<T>,
  { menu }: { menu?: ((row: HTMLElement, at: RowMenuAt) => boolean) | undefined } = {},
): RowHover {
  const [shown, setShown] = useState<{ row: HTMLElement | null; via: RowHoverVia | null; version: number }>({ row: null, via: null, version: 0 });
  const menuRef = useRef(menu);
  useLayoutEffect(() => {
    menuRef.current = menu;
  });
  const api = useRef<Pick<RowHover, "hide" | "hold">>(null);
  // Off as the list goes, before React takes its elements out of the page (which can move focus and fire events):
  // the listeners below go only after that.
  // Stryker disable next-line BooleanLiteral: its own mount layout effect below sets it true before anything can read it (every call through api.current, and the main effect's own listeners, run only once all of this commit's layout effects, including this one, are done), so forcing its initial value false here can't be observed.
  const live = useRef(true);
  useLayoutEffect(() => {
    live.current = true;
    return () => void (live.current = false);
    // Stryker disable next-line ArrayDeclaration: a constant string literal never differs from the previous render's, so these deps compare equal exactly when `[]` does; the effect still runs once at mount and its cleanup once at unmount either way, and no test can tell them apart.
  }, []);
  // After every ref of the update is in place: a list whose element's ref is replaced in the same update the layer
  // arrives in has it only once the layout effects are done.
  useEffect(() => {
    const root = container.current!;
    const doc = root.ownerDocument;
    const win = doc.defaultView!;
    let row: HTMLElement | null = null;
    let via: RowHoverVia | null = null;
    let held = false;
    // The row an event's target is in, among the rows that take the layer (the nearest, in a list inside a row).
    const rowOf = (target: EventTarget | null): HTMLElement | null => {
      for (let node = target instanceof Element ? target : null; node !== null && node !== root; node = node.parentElement) {
        if (layer.get(node) !== undefined) return node as HTMLElement;
      }
      return null;
    };
    const show = (next: HTMLElement | null, how: RowHoverVia | null, sync = true, refocus = true) => {
      // Stryker disable next-line ConditionalExpression: forcing the false branch makes `to` always equal `how`; every call that passes a null `next` also passes a null `how` (hide's show(null, null), hold's close, changed's removal, and the mount's touch no-op all do), so this branch never runs with a how that disagrees with null, and no test can tell the forced value from the real one.
      const to = next === null ? null : how;
      if (!live.current || (next === row && to === via)) return;
      // Focus in the layer goes back to its row before the layer goes, so it never drops to the page; not when a menu
      // opens from it, which takes focus and gives it back to the row as it closes.
      const active = doc.activeElement;
      // No `active !== null` or `active !== row` clause: `row.contains(null)` is already false by
      // spec (a null activeElement, never real in a browser, falls through on its own), and a row
      // is never inside its own toolbar (the portal puts the toolbar in the row, not the row in
      // it), so `active.closest("[data-ouro-row-layer]")` already rules out `active === row` too.
      if (refocus && row !== null && next !== row && row.contains(active) && active!.closest("[data-ouro-row-layer]") !== null) {
        row.focus({ preventScroll: true });
      }
      row = next;
      via = to;
      // Stryker disable next-line ArithmeticOperator: version only forces a new object identity for the `changed` callback below, where row and via stay the same; here the guard above already means next or to differs from the previous row or via, so the object is already new regardless of which way version moves, and version itself is not part of RowHover, so no test can read it.
      const update = () => setShown((previous) => ({ row: next, via: to, version: previous.version + 1 }));
      // From the event itself, so the layer is in the page before the browser draws the next frame.
      if (sync) flushSync(update);
      else update();
    };
    const hide = () => show(null, null);

    const over = (event: PointerEvent) => {
      if (held || event.pointerType === "touch") return;
      // A pointer that has not moved takes nothing: the layer stays where it is until the pointer moves.
      if (resting.has(event)) return root.addEventListener("pointermove", over);
      root.removeEventListener("pointermove", over);
      show(rowOf(event.target), "pointer");
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && via === "pointer") hide();
    };
    const tap = (event: PointerEvent) => {
      if (held || event.pointerType !== "touch") return;
      const tapped = rowOf(event.target);
      const control = (event.target as Element).closest(controls);
      // No `control === null` clause: `tapped.contains(null)` is already false by spec, so the
      // next clause already covers a tap with no control ancestor at all.
      if (tapped !== null && (control === tapped || !tapped.contains(control))) show(tapped, "touch");
    };
    const away = (event: PointerEvent) => {
      if (via === "touch" && !row!.contains(event.target as Node)) hide();
    };
    const focusIn = (event: FocusEvent) => {
      if (held) return;
      const focused = rowOf(event.target);
      // Stryker disable next-line ConditionalExpression: forcing the guard true adds a return only when focused and row are both null; then via is null too (show sets row and via together), so the branches below would do nothing.
      if (focused !== null && focused === row) return;
      if (focused !== null && lastInput() === "keyboard") show(focused, "focus");
      else if (via === "focus") hide();
    };
    const focusOut = (event: FocusEvent) => {
      if (via === "focus" && !root.contains(event.relatedTarget as Node | null)) hide();
    };
    const key = (event: KeyboardEvent) => {
      const target = event.target as Element;
      // Escape in a field (an editor in the row, say) is the field's: it cancels there, and the layer stays.
      if (event.key === "Escape" && row !== null && row.contains(target) && !event.defaultPrevented && target.closest(editable) === null) {
        event.preventDefault();
        hide();
        return;
      }
      // A key on a focused row whose layer is hidden (after Escape, or focus that came before the layer could show)
      // shows it, before the list's own handler, so the right arrow finds it.
      const keyed = rowOf(target);
      if (!held && keyed === target && keyed !== row && event.key !== "Escape") show(keyed, "focus");
      if (!((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") || event.defaultPrevented || menuRef.current === undefined) return;
      if (keyed !== null && target.closest(editable) === null) open(event, keyed, null);
    };
    // A row without a menu leaves the event to the browser.
    const open = (event: Event, opened: HTMLElement, at: RowMenuAt) => {
      if (!menuRef.current!(opened, at)) return;
      event.preventDefault();
      hide();
    };
    const contextMenu = (event: MouseEvent) => {
      const clicked = rowOf(event.target);
      if (clicked === null || menuRef.current === undefined || (event.target as Element).closest(ownMenu) !== null) return;
      const selection = doc.getSelection();
      // Stryker disable next-line ConditionalExpression,EqualityOperator: `doc.getSelection()` is never null in a live document (only before dom-shim-less SSR, which this file's own document guard above already rules out), and a real Selection that is not collapsed always has at least one range (isCollapsed is true whenever rangeCount is 0), so `> 0` and `>= 0` agree on every reachable selection; no test can make a null or rangeless-uncollapsed selection to tell these apart.
      if (selection !== null && !selection.isCollapsed && selection.rangeCount > 0 && clicked.contains(selection.getRangeAt(0).commonAncestorContainer)) return;
      // The context-menu key, where the browser sends this event for it, opens it at the row, as Shift+F10 does.
      open(event, clicked, lastInput() === "keyboard" ? null : { x: event.clientX, y: event.clientY });
    };
    const scrolled = () => {
      if (via !== "pointer" && via !== "touch") return;
      hide();
      // Shown again where the pointer is once it moves: the rows moved under it, and no pointerover says so.
      root.addEventListener("pointermove", over);
    };
    const changed = (changedRow: Element) => {
      if (changedRow !== row) return;
      if (layer.get(changedRow) === undefined) show(null, null, false);
      else setShown((previous) => ({ ...previous, version: previous.version + 1 }));
    };
    // Held for a menu that opens: hidden in the same update as the menu, so opening it draws once.
    api.current = { hide, hold: (on) => ((held = on), on && show(null, null, false, false)) };
    // Focus already in a row, from the keyboard, as the layer arrives; else the pointer already resting on one (the
    // layer's code came after the pointer did, and a pointer that stays still sends nothing more).
    const focused = rowOf(doc.activeElement);
    const under = pointerAt === null ? null : rowOf(doc.elementFromPoint(pointerAt.x, pointerAt.y));
    // Stryker disable next-line ConditionalExpression: row and via are freshly null at the top of this effect, so forcing this guard true when focused is actually null calls show(null, "focus", false), which show's own (next === row && to === via) guard already turns into a no-op.
    if (focused !== null && lastInput() === "keyboard") show(focused, "focus", false);
    else {
      // Stryker disable next-line ConditionalExpression,StringLiteral,LogicalOperator: a touch's lingering hover is the tap handler's to decide; no browser test can make one before the layer arrives. Forcing the whole condition true calls show(null, "pointer", false) when under is null, which is a no-op: row and via are freshly null at the top of this effect, so show's own (next === row && to === via) guard already returns before anything happens.
      if (under !== null && lastInput() !== "touch") show(under, "pointer", false);
    }

    root.addEventListener("pointerover", over);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointerup", tap);
    root.addEventListener("focusin", focusIn);
    root.addEventListener("focusout", focusOut);
    root.addEventListener("keydown", key);
    root.addEventListener("contextmenu", contextMenu);
    // Scrolling does not bubble; the capture phase sees the list's own and any scroller's in it.
    // Stryker disable next-line BooleanLiteral: passive only tells the browser this listener never cancels the scroll, which changes nothing this handler does or a dispatched (never cancelable) test scroll can observe.
    root.addEventListener("scroll", scrolled, { capture: true, passive: true });
    doc.addEventListener("pointerdown", away, true);
    win.addEventListener("blur", hide);
    const stop = layer.listen(changed);
    return () => {
      stop();
      root.removeEventListener("pointerover", over);
      root.removeEventListener("pointermove", over);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointerup", tap);
      root.removeEventListener("focusin", focusIn);
      root.removeEventListener("focusout", focusOut);
      root.removeEventListener("keydown", key);
      root.removeEventListener("contextmenu", contextMenu);
      root.removeEventListener("scroll", scrolled, { capture: true });
      doc.removeEventListener("pointerdown", away, true);
      win.removeEventListener("blur", hide);
    };
  }, [container, layer]);
  return {
    row: shown.row,
    via: shown.via,
    hide: () => api.current?.hide(),
    hold: (on) => api.current?.hold(on),
  };
}
