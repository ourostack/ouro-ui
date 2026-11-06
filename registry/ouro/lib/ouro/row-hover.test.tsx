import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
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
const pointer = (target: Element, type: string, pointerType = "mouse") => target.dispatchEvent(new PointerEvent(type, { bubbles: type !== "pointerleave", pointerType }));
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
    // A key press makes the next focus a keyboard one.
    await userEvent.keyboard("{Shift}");
    await act(async () => row("r1").focus());
    expect(layerIn("r1")).not.toBeNull();
    expect(probe.hover.via).toBe("focus");
    // Into the layer, and back out with Escape: focus goes to the row as the layer goes.
    await act(async () => page.getByRole("button", { name: "Act" }).element().focus());
    expect(layerIn("r1")).not.toBeNull();
    await key(document.activeElement!, { key: "Escape" });
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
    await render(<List count={3} menu={menu} />);
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
});
