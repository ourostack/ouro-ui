import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createRowLayer, useRowHover, type RowHover, type RowLayer, type RowMenuAt } from "@/registry/ouro/lib/ouro/row-hover";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

afterEach(async () => {
  await userEvent.unhover(document.body);
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of mounted) host.remove();
  mounted = [];
  getSelection()?.removeAllRanges();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

function Row({ id, layer, field = true }: { id: string; layer: RowLayer<string>; field?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = ref.current!;
    layer.set(row, id);
    return () => layer.delete(row);
  }, [id, layer]);
  return (
    <div ref={ref} id={id} tabIndex={-1} style={{ height: 40 }}>
      <span data-text="">{id}</span> <button type="button">Inside {id}</button> <a href={`#${id}`}>Link {id}</a> {field && <input aria-label={`Field ${id}`} />}
    </div>
  );
}

// What the hook last returned, for the tests to read and call.
const probe: { hover: RowHover } = { hover: undefined as unknown as RowHover };

/** A list of rows that take one layer, a row that does not, and the layer: a toolbar in the row it is on. */
function List({ count, menu, renders, fields = true }: { count: number; menu?: (row: HTMLElement, at: RowMenuAt) => boolean; renders?: () => void; fields?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [layer] = useState(() => createRowLayer<string>());
  const hover = useRowHover(ref, layer, { menu });
  useLayoutEffect(() => {
    probe.hover = hover;
  });
  renders?.();
  return (
    <div ref={ref} data-testid="list" style={{ height: 200, overflowY: "auto" }}>
      {Array.from({ length: count }, (_, index) => (
        <Row key={index} id={`r${index}`} layer={layer} field={fields} />
      ))}
      <div data-testid="plain" style={{ height: 40 }}>
        Not a row
      </div>
      {hover.row &&
        createPortal(
          <span role="toolbar" aria-label={`Layer on ${layer.get(hover.row)}`} data-ouro-row-layer="">
            <button type="button">Act</button>
          </span>,
          hover.row,
        )}
    </div>
  );
}

const row = (id: string) => document.getElementById(id)!;
const layers = () => [...document.querySelectorAll('[role="toolbar"]')];
const layerIn = (id: string) => row(id).querySelector('[role="toolbar"]');
const list = () => document.querySelector<HTMLElement>("[data-testid=list]")!;
const pointer = (target: Element, type: string, pointerType = "mouse", at?: { x: number; y: number }) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: type !== "pointerleave", pointerType, ...(at && { clientX: at.x, clientY: at.y }) }));
const key = (target: Element, init: KeyboardEventInit) => act(async () => void target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })));

describe("createRowLayer", () => {
  it("holds each row's data, tells its listeners of each change, and runs onFirstRow once", () => {
    const first = vi.fn();
    const layer = createRowLayer<number>(first);
    const heard = vi.fn();
    const stop = layer.listen(heard);
    const [a, b] = [document.createElement("div"), document.createElement("div")];
    layer.set(a, 1);
    layer.set(b, 2);
    expect(first).toHaveBeenCalledOnce();
    expect([layer.get(a), layer.get(b)]).toEqual([1, 2]);
    layer.delete(a);
    expect(layer.get(a)).toBeUndefined();
    expect(heard.mock.calls).toEqual([[a], [b], [a]]);
    stop();
    layer.set(a, 3);
    expect(heard).toHaveBeenCalledTimes(3);
  });
});

describe("useRowHover", () => {
  it("adds the same listeners for a thousand rows as for one", async () => {
    // Rows without fields, whose own listeners React adds to each.
    const listened = async (count: number) => {
      const add = vi.spyOn(EventTarget.prototype, "addEventListener");
      await render(<List count={count} fields={false} />);
      const calls = add.mock.calls.length;
      add.mockRestore();
      await act(async () => roots.pop()!.unmount());
      return calls;
    };
    // The page's first render listens once more, for the page.
    await listened(1);
    expect(await listened(1000)).toBe(await listened(1));
  });

  it("follows the pointer from row to row, on one row at a time, and hides when it leaves a row or the list", async () => {
    await render(<List count={4} />);
    await userEvent.hover(row("r1").querySelector("[data-text]")!);
    expect(layers()).toHaveLength(1);
    expect(layerIn("r1")).not.toBeNull();
    expect(probe.hover.via).toBe("pointer");
    await userEvent.hover(page.getByRole("button", { name: "Act" }));
    expect(layerIn("r1")).not.toBeNull();
    await userEvent.hover(row("r2").querySelector("[data-text]")!);
    expect(layers()).toHaveLength(1);
    expect(layerIn("r2")).not.toBeNull();
    await userEvent.hover(page.getByText("Not a row"));
    expect(layers()).toHaveLength(0);
    await userEvent.hover(row("r3").querySelector("[data-text]")!);
    expect(layerIn("r3")).not.toBeNull();
    await userEvent.unhover(document.body);
    expect(layers()).toHaveLength(0);
    expect(probe.hover.via).toBeNull();
    // A finger's pointerover and pointerleave are a tap's, not a hover's.
    await act(async () => void pointer(row("r0"), "pointerover", "touch"));
    expect(layers()).toHaveLength(0);
    await userEvent.hover(row("r1").querySelector("[data-text]")!);
    expect(layerIn("r1")).not.toBeNull();
    await act(async () => void pointer(list(), "pointerleave", "touch"));
    expect(layerIn("r1")).not.toBeNull();
    // The mouse leaving the list takes away what it showed.
    await act(async () => void pointer(list(), "pointerleave"));
    expect(layers()).toHaveLength(0);
  });

  it("shows the layer within the pointer's own event, before the next frame", async () => {
    let renders = 0;
    await render(<List count={2} renders={() => renders++} />);
    const before = renders;
    pointer(row("r0"), "pointerover");
    expect(layerIn("r0")).not.toBeNull();
    expect(renders).toBe(before + 1);
    // The same row again renders nothing.
    pointer(row("r0").querySelector("button")!, "pointerover");
    expect(renders).toBe(before + 1);
  });

  it("shows on keyboard focus, not on a click's, and Escape hides it with focus back on the row", async () => {
    await render(
      <>
        <button type="button">Before</button>
        <List count={3} />
        <button type="button">After</button>
      </>,
    );
    await userEvent.click(row("r0").querySelector("input")!);
    await userEvent.unhover(document.body);
    expect(layers()).toHaveLength(0);
    // A row's own focus, landing there by neither the pointer nor a keyboard press since (the last input
    // is still the click above), shows nothing: only a keyboard-driven focus does.
    await act(async () => row("r1").focus());
    expect(layers()).toHaveLength(0);
    // A key press makes the next focus a keyboard one.
    await userEvent.keyboard("{Shift}");
    await act(async () => row("r1").focus());
    expect(layerIn("r1")).not.toBeNull();
    expect(probe.hover.via).toBe("focus");
    // Into the layer, and back out with Escape: focus goes to the row as the layer goes, by a call that
    // tells the browser not to scroll for it (the layer is already in view; this is a refocus, not a nav).
    await act(async () => page.getByRole("button", { name: "Act" }).element().focus());
    expect(layerIn("r1")).not.toBeNull();
    const focusSpy = vi.spyOn(row("r1"), "focus");
    const escaped = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void document.activeElement!.dispatchEvent(escaped));
    expect(escaped.defaultPrevented).toBe(true);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    focusSpy.mockRestore();
    expect(layers()).toHaveLength(0);
    expect(document.activeElement).toBe(row("r1"));
    // Another key on the focused row brings it back, before the list's own handler sees the key.
    await key(row("r1"), { key: "ArrowRight" });
    expect(layerIn("r1")).not.toBeNull();
    await act(async () => row("r2").focus());
    expect(layerIn("r2")).not.toBeNull();
    // Focus on something in the list that is not a row, and focus leaving the list, both hide it.
    await act(async () => page.getByText("Not a row").element().setAttribute("tabindex", "-1"));
    await act(async () => (page.getByText("Not a row").element() as HTMLElement).focus());
    expect(layers()).toHaveLength(0);
    await act(async () => row("r2").focus());
    await act(async () => page.getByRole("button", { name: "After" }).element().focus());
    expect(layers()).toHaveLength(0);
    // An Escape in a field in the row is the field's: never taken, and the layer stays.
    await act(async () => row("r2").focus());
    await act(async () => row("r2").querySelector("input")!.focus());
    expect(layerIn("r2")).not.toBeNull();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void row("r2").querySelector("input")!.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(false);
    expect(layerIn("r2")).not.toBeNull();
    // An Escape the app took first is the app's.
    await act(async () => row("r2").focus());
    const taken = (event: KeyboardEvent) => event.preventDefault();
    row("r2").addEventListener("keydown", taken);
    await key(row("r2"), { key: "Escape" });
    row("r2").removeEventListener("keydown", taken);
    expect(layerIn("r2")).not.toBeNull();
  });

  it("shows on a tap until a press lands elsewhere, and a tap on a control is the control's", async () => {
    await render(<List count={3} />);
    await act(async () => void pointer(row("r0").querySelector("button")!, "pointerup", "touch"));
    expect(layers()).toHaveLength(0);
    await act(async () => void pointer(row("r0").querySelector("[data-text]")!, "pointerup", "touch"));
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("touch");
    // A mouse's press is not a tap; a press in the row keeps it.
    await act(async () => void pointer(row("r1"), "pointerup"));
    await act(async () => void pointer(row("r0"), "pointerdown", "touch"));
    expect(layerIn("r0")).not.toBeNull();
    await act(async () => void pointer(document.body, "pointerdown", "touch"));
    expect(layers()).toHaveLength(0);
    await act(async () => void pointer(row("r2"), "pointerup", "touch"));
    expect(layerIn("r2")).not.toBeNull();
    // The pointer leaving after a tap leaves it.
    await act(async () => void pointer(list(), "pointerleave"));
    expect(layerIn("r2")).not.toBeNull();
    // A press elsewhere hides it even when a control along the way stops the press from bubbling
    // out to the document (this listener holds the capture phase, which runs ahead of that).
    const stopper = (event: Event) => event.stopPropagation();
    const button = row("r1").querySelector("button")!;
    button.addEventListener("pointerdown", stopper);
    await act(async () => void pointer(button, "pointerdown", "touch"));
    button.removeEventListener("pointerdown", stopper);
    expect(layers()).toHaveLength(0);
  });

  it("a tap's pointerup landing outside any row does nothing: hiding a stray touch elsewhere is the pointerdown handler's job, not this one's", async () => {
    await render(<List count={2} />);
    await act(async () => void pointer(row("r0").querySelector("[data-text]")!, "pointerup", "touch"));
    expect(layerIn("r0")).not.toBeNull();
    await act(async () => void pointer(page.getByText("Not a row").element(), "pointerup", "touch"));
    expect(layerIn("r0")).not.toBeNull();
  });

  it("a tap on the row its own layer is already shown on does not refocus the row: focus already in its toolbar stays there", async () => {
    await render(<List count={1} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(layerIn("r0")).not.toBeNull();
    await act(async () => void page.getByRole("button", { name: "Act" }).element().focus());
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Act" }).element());
    // The same row, now tapped: its via changes, but it is still the row already shown, so there
    // is nothing to move focus back to before a swap. Focus stays on the toolbar's own button.
    await act(async () => void pointer(row("r0").querySelector("[data-text]")!, "pointerup", "touch"));
    expect(probe.hover.via).toBe("touch");
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Act" }).element());
  });

  it("hides on a scroll until the pointer moves again, on the window's blur and when the row goes", async () => {
    const { rerender } = await render(<List count={10} />);
    await userEvent.hover(row("r2").querySelector("[data-text]")!);
    expect(layerIn("r2")).not.toBeNull();
    await act(async () => void list().dispatchEvent(new Event("scroll")));
    expect(layers()).toHaveLength(0);
    // Nothing comes back until the pointer moves; then on the row it is over.
    await act(async () => void pointer(row("r3"), "pointermove"));
    expect(layerIn("r3")).not.toBeNull();
    // A scroll under a row shown by a tap hides it too, not only one shown by the pointer.
    await act(async () => void pointer(row("r3"), "pointerup", "touch"));
    expect(probe.hover.via).toBe("touch");
    await act(async () => void list().dispatchEvent(new Event("scroll")));
    expect(layers()).toHaveLength(0);
    // A real coordinate, not the bare default (0, 0): the previous move already left the page's last
    // pointer position at (0, 0), so a second bare dispatch would read as the same resting pointer.
    await act(async () => void pointer(row("r3"), "pointermove", "mouse", { x: 20, y: 20 }));
    expect(layerIn("r3")).not.toBeNull();
    // Scrolling with keyboard focus keeps it: the layer moves with its row.
    await userEvent.unhover(document.body);
    await userEvent.keyboard("{Shift}");
    await act(async () => row("r4").focus());
    await act(async () => void list().dispatchEvent(new Event("scroll")));
    expect(layerIn("r4")).not.toBeNull();
    await act(async () => void window.dispatchEvent(new Event("blur")));
    expect(layers()).toHaveLength(0);
    await act(async () => row("r9").focus());
    expect(layerIn("r9")).not.toBeNull();
    await rerender(<List count={9} />);
    expect(layers()).toHaveLength(0);
    expect(probe.hover.row).toBeNull();
  });

  it("opens the menu on right-click, Shift+F10 and the context-menu key, and leaves fields, links and selected text to the browser", async () => {
    const menu = vi.fn((target: HTMLElement) => target.id !== "r2");
    const { rerender } = await render(<List count={3} menu={menu} />);
    const text = row("r0").querySelector("[data-text]")!;
    await userEvent.hover(text);
    const right = (target: Element) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 34 });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(layerIn("r0")).not.toBeNull();
    expect(right(text)).toBe(true);
    expect(layers()).toHaveLength(0);
    expect(menu).toHaveBeenLastCalledWith(row("r0"), { x: 12, y: 34 });
    // A row whose app has no menu for it, a field and selected text keep the browser's menu.
    expect(right(row("r2"))).toBe(false);
    menu.mockClear();
    expect(right(row("r0").querySelector("input")!)).toBe(false);
    expect(right(row("r0").querySelector("a")!)).toBe(false);
    expect(right(page.getByText("Not a row").element())).toBe(false);
    getSelection()!.selectAllChildren(text);
    expect(right(text)).toBe(false);
    getSelection()!.removeAllRanges();
    expect(menu).not.toHaveBeenCalled();
    // From the keyboard, at the row.
    await key(row("r1"), { key: "F10", shiftKey: true });
    expect(menu).toHaveBeenLastCalledWith(row("r1"), null);
    await key(row("r1"), { key: "ContextMenu" });
    expect(menu).toHaveBeenCalledTimes(2);
    await key(row("r1"), { key: "F10" });
    await key(row("r1").querySelector("input")!, { key: "ContextMenu" });
    expect(menu).toHaveBeenCalledTimes(2);
    await userEvent.keyboard("{Shift}");
    expect(right(row("r1"))).toBe(true);
    expect(menu).toHaveBeenLastCalledWith(row("r1"), null);
    // A new `menu` prop on a re-render is the one a later right-click uses: the effect that keeps
    // the ref in sync with it runs on every render, not just the first. `menu` opened for r1; menu2
    // never does, so a stale ref calling the old one would still show true here.
    const menu2 = vi.fn(() => false);
    await rerender(<List count={3} menu={menu2} />);
    expect(right(row("r1"))).toBe(false);
    expect(menu2).toHaveBeenCalled();
  });

  it("leaves Shift+F10 and the context-menu key to the browser off a row: nothing to open for what the keydown did not land on", async () => {
    const menu = vi.fn(() => true);
    await render(<List count={2} menu={menu} />);
    const plain = page.getByText("Not a row").element() as HTMLElement;
    await key(plain, { key: "F10", shiftKey: true });
    expect(menu).not.toHaveBeenCalled();
    await key(plain, { key: "ContextMenu" });
    expect(menu).not.toHaveBeenCalled();
  });

  it("leaves a right-click on a row to the browser's own menu when the app gave none", async () => {
    await render(<List count={2} />);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    row("r0").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Shift+F10 and the context-menu key to the browser too when the app gave no menu", async () => {
    await render(<List count={2} />);
    const f10 = new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => void row("r0").dispatchEvent(f10));
    expect(f10.defaultPrevented).toBe(false);
    const contextMenuKey = new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true });
    await act(async () => void row("r0").dispatchEvent(contextMenuKey));
    expect(contextMenuKey.defaultPrevented).toBe(false);
  });

  it("a caret inside a row's text (no real selection, just where it last clicked) does not block its own right-click menu", async () => {
    const menu = vi.fn(() => true);
    await render(<List count={2} menu={menu} />);
    const text = row("r0").querySelector("[data-text]")!;
    getSelection()!.collapse(text.firstChild!, 0);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 });
    row("r0").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(menu).toHaveBeenCalledWith(row("r0"), expect.anything());
    getSelection()!.removeAllRanges();
  });

  it("a key that finds the row already shown leaves how it got there alone: a pointer's hover is not retagged as a keyboard focus", async () => {
    await render(<List count={2} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(probe.hover.via).toBe("pointer");
    // Focus arrives on the row itself, but the last input was still the hover above, not a key:
    // keyboard focus does not retag an already-shown pointer hover.
    await act(async () => row("r0").focus());
    expect(probe.hover.via).toBe("pointer");
    // A key lands on the row itself, which is already the one shown; nothing about how it is shown changes.
    await key(row("r0"), { key: "ArrowRight" });
    expect(probe.hover.via).toBe("pointer");
  });

  it("a focus event on the row already shown does not retag a pointer's hover as a keyboard focus either, even right after a key press", async () => {
    await render(<List count={2} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(probe.hover.via).toBe("pointer");
    // A key press makes the next focus a keyboard one, but this focus event lands on the row
    // that is already shown: the early return above takes it before that matters.
    await userEvent.keyboard("{Shift}");
    await act(async () => row("r0").focus());
    expect(probe.hover.via).toBe("pointer");
  });

  it("losing focus out of the list does not hide a row shown by the pointer: that blur handling is the keyboard focus's own", async () => {
    await render(<List count={2} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(probe.hover.via).toBe("pointer");
    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => void list().dispatchEvent(new FocusEvent("focusout", { relatedTarget: outside })));
    expect(probe.hover.via).toBe("pointer");
    outside.remove();
  });

  it("keyboard focus landing in the list but not on a row does not clear a layer the pointer is already showing: that is the keyboard-focus branch's own case, not a plain blur", async () => {
    await render(<List count={2} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(probe.hover.via).toBe("pointer");
    await userEvent.keyboard("{Shift}");
    await act(async () => void page.getByText("Not a row").element().setAttribute("tabindex", "-1"));
    await act(async () => (page.getByText("Not a row").element() as HTMLElement).focus());
    expect(probe.hover.via).toBe("pointer");
  });

  it("moving the layer to a different row does not steal focus from a field inside the row it is leaving: only focus that was in the floating layer goes back to the row", async () => {
    await render(<List count={3} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    await act(async () => row("r0").querySelector("input")!.focus());
    expect(document.activeElement).toBe(row("r0").querySelector("input"));
    await userEvent.hover(row("r1").querySelector("[data-text]")!);
    expect(document.activeElement).toBe(row("r0").querySelector("input"));
  });

  it("a key on a row's own field, not the row itself, leaves the row's hidden state alone: the field keeps its own key handling", async () => {
    await render(<List count={2} />);
    await act(async () => row("r0").querySelector("input")!.focus());
    expect(layers()).toHaveLength(0);
    await key(row("r0").querySelector("input")!, { key: "ArrowRight" });
    expect(layers()).toHaveLength(0);
  });

  it("an Escape landing directly on a row that is not yet shown does not summon it", async () => {
    await render(<List count={2} />);
    await key(row("r0"), { key: "Escape" });
    expect(layers()).toHaveLength(0);
  });

  it("stays hidden while held, as while a row's menu is open, and from hide until the pointer next arrives", async () => {
    await render(<List count={3} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    await act(async () => probe.hover.hold(true));
    expect(layers()).toHaveLength(0);
    await userEvent.hover(row("r1").querySelector("[data-text]")!);
    await act(async () => void pointer(row("r1"), "pointerup", "touch"));
    await userEvent.keyboard("{Shift}");
    await act(async () => row("r2").focus());
    await key(row("r2"), { key: "ArrowDown" });
    expect(layers()).toHaveLength(0);
    await act(async () => probe.hover.hold(false));
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(layerIn("r0")).not.toBeNull();
    await act(async () => probe.hover.hide());
    expect(layers()).toHaveLength(0);
  });

  it("holds and opens its own menu together: the layer goes and the menu comes in the one commit a menu's own flushSync forces, never a frame with neither", async () => {
    let renders = 0;
    const layer = createRowLayer<string>();
    function Harness() {
      renders++;
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const [menuOpen, setMenuOpen] = useState(false);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        layer.set(rowRef.current!, "r0");
      }, []);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label="Layer on r0" />, hover.row)}
          {menuOpen && <span role="menu">Menu</span>}
          <button
            type="button"
            // The real menu's own open path (message-parts.tsx's MessageBarLayer): hold and the
            // menu's own state both inside one flushSync, so they draw together or not at all.
            onClick={() =>
              flushSync(() => {
                hover.hold(true);
                setMenuOpen(true);
              })
            }
          >
            Open menu
          </button>
        </div>
      );
    }
    await render(<Harness />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(layerIn("r0")).not.toBeNull();
    const before = renders;
    await act(async () => (page.getByRole("button", { name: "Open menu" }).element() as HTMLElement).click());
    expect(layerIn("r0")).toBeNull();
    expect(page.getByRole("menu").element()).not.toBeNull();
    // One more render, not two: hold's own update never forced a commit of its own ahead of the
    // menu's, which would draw a frame with the layer already gone and the menu not yet there.
    expect(renders).toBe(before + 1);
  });

  it("opening a row's menu does not first pull focus back to the row: that refocus is only for a normal hide", async () => {
    await render(<List count={2} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    await act(async () => page.getByRole("button", { name: "Act" }).element().focus());
    expect(document.activeElement).not.toBe(row("r0"));
    await act(async () => probe.hover.hold(true));
    // The toolbar unmounted with focus still inside it; the browser dropped focus to the page,
    // not to the row, because hold's close does not try to refocus the row the way hide does.
    expect(document.activeElement).not.toBe(row("r0"));
  });

  it("arrives in the same update as a new ref to its list's element, and works", async () => {
    const layer = createRowLayer<string>();
    function Hooked({ container }: { container: RefObject<HTMLElement | null> }) {
      const hover = useRowHover(container, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      return null;
    }
    // Its ref is a new function in the update the layer arrives in: React detaches the old one, mounts the layer, and
    // only then attaches the new one.
    function Host({ on }: { on: boolean }) {
      const ref = useRef<HTMLElement | null>(null);
      const attach = useCallback(
        (element: HTMLDivElement | null) => {
          ref.current = element;
          return () => void (ref.current = null);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- a new ref function when the layer arrives, on purpose
        [on],
      );
      const rowRef = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => layer.set(rowRef.current!, "r0"), []);
      return (
        <div ref={attach}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            Row
          </div>
          {on ? <Hooked container={ref} /> : null}
        </div>
      );
    }
    const { rerender } = await render(<Host on={false} />);
    await rerender(<Host on />);
    pointer(row("r0"), "pointerover");
    await expect.poll(() => probe.hover.row).toBe(row("r0"));
  });

  it("takes nothing from a pointer that has not moved: the page changing under it neither moves nor hides the layer, until it moves", async () => {
    await render(<List count={3} fields={false} />);
    // The pointer rests over r1's empty end, on a cover over the page, and the layer is on r0 from the keyboard.
    const cover = document.createElement("div");
    cover.setAttribute("style", "position:fixed;inset:0");
    document.body.append(cover);
    const box = row("r1").getBoundingClientRect();
    await userEvent.hover(cover, { position: { x: box.right - 4, y: box.top + 20 } });
    await userEvent.keyboard("{Shift}");
    await act(async () => row("r0").focus());
    expect(layerIn("r0")).not.toBeNull();
    // The cover goes, and r1 is under the pointer: the browser says so with a pointerover where the pointer already was.
    let resent = false;
    document.addEventListener("pointerover", () => (resent = true), { once: true });
    await act(async () => cover.remove());
    await expect.poll(() => resent).toBe(true);
    for (let frame = 0; frame < 3; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("focus");
    // Moving, even within r1, which sends no pointerover, brings it there.
    await userEvent.hover(row("r1"), { position: { x: box.width - 8, y: 20 } });
    expect(layerIn("r1")).not.toBeNull();
    expect(probe.hover.via).toBe("pointer");
  });

  it("takes an armed, resting listener out with the layer whose effect armed it: a later layer never hears it", async () => {
    // A layer of its own per render, kept (not swapped out) on the row, so a stale listener from the first layer's
    // effect, were the cleanup not to remove it, would still find the row and could still show it.
    function Harness({ layer }: { layer: RowLayer<string> }) {
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        layer.set(rowRef.current!, "r0");
      }, [layer]);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label="Layer on r0" />, hover.row)}
        </div>
      );
    }
    const { rerender } = await render(<Harness layer={createRowLayer<string>()} />);
    const target = row("r0");
    // Off-screen, so the new effect's own arrival check (what the pointer already rests on) can never find r0 here:
    // only a stale listener from the torn-down effect could show it from here on.
    await act(async () => {
      pointer(target, "pointermove", "mouse", { x: -1000, y: -1000 });
      // A pointerover at the same spot as the last pointermove is a resting one: it shows nothing, but arms the
      // effect's `over` to listen for the next pointermove instead.
      pointer(target, "pointerover", "mouse", { x: -1000, y: -1000 });
    });
    expect(layerIn("r0")).toBeNull();
    // A new layer: the old effect tears down, and its armed pointermove listener should go with it.
    await rerender(<Harness layer={createRowLayer<string>()} />);
    // No pointerover first this time: only the old effect's stale, still-armed listener would show the row now.
    await act(async () => void pointer(target, "pointermove", "mouse", { x: 40, y: 60 }));
    expect(layerIn("r0")).toBeNull();
    expect(probe.hover.row).toBeNull();
  });

  it("takes its own armed, resting listener out once a real move answers it: a later, unrelated move does not reach it twice", async () => {
    await render(<List count={2} />);
    const target = row("r0");
    // Resting, off the layout entirely, so only an armed `over`, still listening for the next
    // pointermove, could explain anything that follows.
    await act(async () => {
      pointer(target, "pointermove", "mouse", { x: -2000, y: -2000 });
      pointer(target, "pointerover", "mouse", { x: -2000, y: -2000 });
    });
    expect(layerIn("r0")).toBeNull();
    // A real move answers it: the layer shows, and `over` should stop listening for every move again.
    await act(async () => void pointer(target, "pointermove", "mouse", { x: 10, y: 10 }));
    expect(layerIn("r0")).not.toBeNull();
    // A later, unrelated move on a different row, with no pointerover of its own: only a leftover
    // listener from the first move would still catch this and move the layer from a bare move.
    await act(async () => void pointer(row("r1"), "pointermove", "mouse", { x: 20, y: 20 }));
    expect(layerIn("r0")).not.toBeNull();
  });

  it("takes the scroll listener out with the layer whose effect added it: scrolling after a layer swap never hides from the old one", async () => {
    function Harness({ layer }: { layer: RowLayer<string> }) {
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        layer.set(rowRef.current!, "r0");
      }, [layer]);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label="Layer on r0" />, hover.row)}
        </div>
      );
    }
    const { rerender } = await render(<Harness layer={createRowLayer<string>()} />);
    const target = row("r0");
    // A plain pointerover, not a resting one: it shows the row right away, so this effect's `via` is "pointer".
    await act(async () => {
      pointer(target, "pointermove", "mouse", { x: -500, y: -500 });
      pointer(target, "pointerover", "mouse", { x: 10, y: 10 });
    });
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("pointer");
    // A new layer: the old effect tears down, and its scroll listener (always on from mount, not armed like
    // pointermove) should go with it. The new effect's own `via` starts null, so its own scroll handler no-ops.
    await rerender(<Harness layer={createRowLayer<string>()} />);
    await act(async () => void list().dispatchEvent(new Event("scroll")));
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("pointer");
  });

  it("takes the tap listener out with the layer whose effect added it: a touch tap on the row after a layer swap never shows through the old one", async () => {
    // Only the old layer ever gets the row: a new layer's own tap handler, with the row unregistered
    // in it, finds nothing there, so only a stale listener from the torn-down effect could still
    // show it from a touch alone.
    const oldLayer = createRowLayer<string>();
    function Harness({ layer }: { layer: RowLayer<string> }) {
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        oldLayer.set(rowRef.current!, "r0");
      }, []);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label="Layer on r0" />, hover.row)}
        </div>
      );
    }
    const { rerender } = await render(<Harness layer={oldLayer} />);
    const target = row("r0");
    await act(async () => {
      pointer(target, "pointermove", "mouse", { x: -500, y: -500 });
      pointer(target, "pointerover", "mouse", { x: 10, y: 10 });
    });
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("pointer");
    // A new, empty layer: the old effect tears down, and its tap listener should go with it.
    await rerender(<Harness layer={createRowLayer<string>()} />);
    await act(async () => void pointer(target, "pointerup", "touch"));
    expect(probe.hover.via).toBe("pointer");
  });

  it("takes the focusout listener out with the layer whose effect added it: focus leaving the list after a layer swap never hides from the old one", async () => {
    // Only the old layer ever gets the row: a new layer's own mount-time arrival check, with the
    // row unregistered in it, finds nothing focused there, so its own via never becomes "focus"
    // and its own focusout handler stays a no-op; only a stale listener from the torn-down effect
    // could still hide from this one's focus alone.
    const oldLayer = createRowLayer<string>();
    function Harness({ layer }: { layer: RowLayer<string> }) {
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        oldLayer.set(rowRef.current!, "r0");
      }, []);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" tabIndex={-1} style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label="Layer on r0" />, hover.row)}
        </div>
      );
    }
    const { rerender } = await render(<Harness layer={oldLayer} />);
    const target = row("r0");
    await userEvent.keyboard("{Shift}");
    await act(async () => target.focus());
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("focus");
    // A new, empty layer: the old effect tears down, and its focusout listener should go with it.
    await rerender(<Harness layer={createRowLayer<string>()} />);
    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => void list().dispatchEvent(new FocusEvent("focusout", { relatedTarget: outside })));
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("focus");
    outside.remove();
  });

  it("takes the pointerleave listener out with the layer whose effect added it: the pointer leaving after a layer swap never hides from the old one", async () => {
    function Harness({ layer }: { layer: RowLayer<string> }) {
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        layer.set(rowRef.current!, "r0");
      }, [layer]);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label="Layer on r0" />, hover.row)}
        </div>
      );
    }
    const { rerender } = await render(<Harness layer={createRowLayer<string>()} />);
    const target = row("r0");
    await act(async () => {
      pointer(target, "pointermove", "mouse", { x: -500, y: -500 });
      pointer(target, "pointerover", "mouse", { x: 10, y: 10 });
    });
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("pointer");
    // A new layer: the old effect tears down, and its pointerleave listener should go with it. The
    // new effect's own `via` starts null, so its own pointerleave handler no-ops.
    await rerender(<Harness layer={createRowLayer<string>()} />);
    await act(async () => void pointer(list(), "pointerleave"));
    expect(layerIn("r0")).not.toBeNull();
    expect(probe.hover.via).toBe("pointer");
  });

  it("takes the layer's own change listener out with the effect that added it: the old layer's data changing after a layer swap renders nothing", async () => {
    let renders = 0;
    function Harness({ layer }: { layer: RowLayer<string> }) {
      renders++;
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        layer.set(rowRef.current!, "r0");
      }, [layer]);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label="Layer on r0" />, hover.row)}
        </div>
      );
    }
    const oldLayer = createRowLayer<string>();
    const { rerender } = await render(<Harness layer={oldLayer} />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(layerIn("r0")).not.toBeNull();
    // A new layer: the old effect tears down, unsubscribing from the old layer's own changes. The
    // old layer's data changing afterward should no longer reach into a (gone) effect's setState.
    await rerender(<Harness layer={createRowLayer<string>()} />);
    const before = renders;
    await act(async () => void oldLayer.set(row("r0"), "r0-updated"));
    expect(renders).toBe(before);
  });

  it("shows on a row focused from the keyboard, or the pointer rests on, before the layer arrived", async () => {
    function Late() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            Show
          </button>
          {shown ? <List count={2} /> : null}
        </>
      );
    }
    await render(<Late />);
    await act(async () => (page.getByRole("button", { name: "Show" }).element() as HTMLElement).click());
    expect(layers()).toHaveLength(0);
    await act(async () => roots.pop()!.unmount());
    // Focus in a row as the layer's hook first runs.
    const layer = createRowLayer<string>();
    function Focused({ ready }: { ready: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        layer.set(ref.current!, "r0");
        ref.current!.focus();
      }, []);
      return (
        <div>
          <div ref={ref} id="r0" tabIndex={-1}>
            Row
          </div>
          {ready ? <Layer /> : null}
        </div>
      );
    }
    function Layer() {
      const ref = useRef<HTMLElement | null>(null);
      useLayoutEffect(() => {
        ref.current = document.getElementById("r0")!.parentElement;
      });
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      return null;
    }
    await userEvent.keyboard("{Shift}");
    const { rerender } = await render(<Focused ready={false} />);
    await rerender(<Focused ready />);
    expect(probe.hover.row).toBe(row("r0"));
    expect(probe.hover.via).toBe("focus");
    await act(async () => roots.pop()!.unmount());
    // The pointer resting on a row as the layer's hook first runs, with nothing focused in it.
    function Rested({ ready }: { ready: boolean }) {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        layer.set(ref.current!, "r0");
      }, []);
      return (
        <div>
          <div ref={ref} id="r0" style={{ height: 40 }}>
            Row
          </div>
          {ready ? <Layer /> : null}
        </div>
      );
    }
    const rested = await render(<Rested ready={false} />);
    await userEvent.hover(row("r0"));
    await rested.rerender(<Rested ready />);
    expect(probe.hover.row).toBe(row("r0"));
    expect(probe.hover.via).toBe("pointer");
  });

  it("a list inside a row stops looking for a row at its own root: it never reaches past it to an ancestor row of the same shared layer", async () => {
    const layer = createRowLayer<string>();
    function Inner({ container }: { container: RefObject<HTMLDivElement | null> }) {
      const hover = useRowHover(container, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      return null;
    }
    function Outer() {
      const outerRef = useRef<HTMLDivElement>(null);
      const innerRef = useRef<HTMLDivElement>(null);
      useRowHover(outerRef, layer);
      useLayoutEffect(() => {
        layer.set(outerRef.current!, "outer");
      }, []);
      return (
        <div ref={outerRef} data-testid="list">
          <div ref={innerRef}>
            <span data-text="">Plain</span>
          </div>
          <Inner container={innerRef} />
        </div>
      );
    }
    const { host } = await render(<Outer />);
    await userEvent.hover(host.querySelector("[data-text]")!);
    // The inner list's own root holds nothing of its own here; an outer row that happens to share
    // its layer is still not the inner list's to claim.
    expect(probe.hover.row).toBeNull();
  });

  it("a shown row's own data changing reaches the layer too, even though the row it is shown on does not", async () => {
    const layer = createRowLayer<string>();
    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const rowRef = useRef<HTMLDivElement>(null);
      const hover = useRowHover(ref, layer);
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      useLayoutEffect(() => {
        layer.set(rowRef.current!, "v1");
      }, []);
      return (
        <div ref={ref} data-testid="list" style={{ height: 200 }}>
          <div ref={rowRef} id="r0" style={{ height: 40 }}>
            <span data-text="">Row</span>
          </div>
          {hover.row && createPortal(<span role="toolbar" aria-label={`Layer shows ${layer.get(hover.row)}`} />, hover.row)}
        </div>
      );
    }
    await render(<Harness />);
    await userEvent.hover(row("r0").querySelector("[data-text]")!);
    expect(layers()[0]?.getAttribute("aria-label")).toBe("Layer shows v1");
    // The row stays the one shown; only its data changes. The list's own re-render (not a new
    // show()) is what carries the new data to the layer.
    await act(async () => void layer.set(row("r0"), "v2"));
    expect(layers()[0]?.getAttribute("aria-label")).toBe("Layer shows v2");
  });

  it("calling hide or hold before the layer's own effect has set up its api is a no-op, not a crash", async () => {
    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const [layer] = useState(() => createRowLayer<string>());
      const hover = useRowHover(ref, layer);
      // This layout effect runs before the hook's own useEffect (every useLayoutEffect in the
      // commit runs before any useEffect), so api.current is still null here.
      useLayoutEffect(() => {
        hover.hide();
        hover.hold(true);
      });
      useLayoutEffect(() => {
        probe.hover = hover;
      });
      return <div ref={ref} data-testid="list" />;
    }
    await render(<Harness />);
    expect(probe.hover.row).toBeNull();
  });
});
