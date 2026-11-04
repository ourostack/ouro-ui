"use client";

import { createContext, useLayoutEffect, useRef, useState, type RefObject } from "react";
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
// Where a right-click stays the browser's: a field's own menu (spelling, paste).
const editable = 'input, textarea, [contenteditable]:not([contenteditable="false"])';

/**
 * One layer for a whole list, such as the action bar over the message the pointer is on: the list
 * renders it once, on the row this returns, rather than one per row. It listens once, on the list
 * (`pointerover` and `pointerleave` delegated from the rows, focus, keys, scrolling, a tap and the
 * window's blur), so a list of a thousand rows costs what a list of one does, and the layer is on
 * at most one row at a time. A mouse or pen over a row shows it there at once (in the same event,
 * before the next frame), and moving off the row or the list hides it. Keyboard focus arriving in
 * a row shows it too, and Escape hides it, putting focus back on the row if it was in the layer.
 * A tap on a row shows it until a press lands elsewhere. Scrolling under the pointer, the window
 * losing focus and the row going all hide it, so it never stays on a row the pointer has left.
 * `menu` opens the app's menu for a row: right-click (except on a field or over selected text,
 * whose menus stay the browser's), Shift+F10 or the context-menu key on a focused row. It returns
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
 * @claim "Keyboard focus arriving in a row shows it too" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > shows on keyboard focus, not on a click's, and Escape hides it with focus back on the row)
 * @claim "A tap on a row shows it until" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > shows on a tap until a press lands elsewhere, and a tap on a control is the control's)
 * @claim "Scrolling under the pointer, the window" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > hides on a scroll until the pointer moves again, on the window's blur and when the row goes)
 * @claim "when it returns false, the right-click goes" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > opens the menu on right-click, Shift+F10 and the context-menu key, and leaves fields and selected text to the browser)
 * @claim "`menu` opens the app's menu for a row" registry/ouro/lib/ouro/row-hover.test.tsx verify:testExists(registry/ouro/lib/ouro/row-hover.test.tsx::useRowHover > opens the menu on right-click, Shift+F10 and the context-menu key, and leaves fields and selected text to the browser)
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
  useLayoutEffect(() => {
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
    const show = (next: HTMLElement | null, how: RowHoverVia | null, sync = true) => {
      const to = next === null ? null : how;
      if (next === row && to === via) return;
      // Focus in the layer goes back to its row before the layer goes, so it never drops to the page.
      const active = doc.activeElement;
      if (row !== null && next !== row && active !== null && active !== row && row.contains(active) && active.closest("[data-ouro-row-layer]") !== null) {
        row.focus({ preventScroll: true });
      }
      row = next;
      via = to;
      const update = () => setShown((previous) => ({ row: next, via: to, version: previous.version + 1 }));
      // From the event itself, so the layer is in the page before the browser draws the next frame.
      if (sync) flushSync(update);
      else update();
    };
    const hide = () => show(null, null);

    const over = (event: PointerEvent) => {
      if (held || event.pointerType === "touch") return;
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
      if (tapped !== null && (control === null || control === tapped || !tapped.contains(control))) show(tapped, "touch");
    };
    const away = (event: PointerEvent) => {
      if (via === "touch" && !row!.contains(event.target as Node)) hide();
    };
    const focusIn = (event: FocusEvent) => {
      if (held) return;
      const focused = rowOf(event.target);
      if (focused !== null && focused === row) return;
      if (focused !== null && lastInput() === "keyboard") show(focused, "focus");
      else if (via === "focus") hide();
    };
    const focusOut = (event: FocusEvent) => {
      if (via === "focus" && !root.contains(event.relatedTarget as Node | null)) hide();
    };
    const key = (event: KeyboardEvent) => {
      const target = event.target as Element;
      if (event.key === "Escape" && row !== null && row.contains(target) && !event.defaultPrevented) {
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
      if (clicked === null || menuRef.current === undefined || (event.target as Element).closest(editable) !== null) return;
      const selection = doc.getSelection();
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
    api.current = { hide, hold: (on) => ((held = on), on && hide()) };
    // Focus already in a row, from the keyboard, as the layer arrives.
    const focused = rowOf(doc.activeElement);
    if (focused !== null && lastInput() === "keyboard") show(focused, "focus", false);

    root.addEventListener("pointerover", over);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointerup", tap);
    root.addEventListener("focusin", focusIn);
    root.addEventListener("focusout", focusOut);
    root.addEventListener("keydown", key);
    root.addEventListener("contextmenu", contextMenu);
    // Scrolling does not bubble; the capture phase sees the list's own and any scroller's in it.
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
