import { lazy, Suspense, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { Resizable, ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/registry/ouro/components/ouro/resizable/resizable";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, { width = 400, height = 200, dir }: { width?: number; height?: number; dir?: "rtl" } = {}) {
  const host = document.createElement("div");
  Object.assign(host.style, { width: `${width}px`, height: `${height}px`, position: "absolute", top: "0", left: "0" });
  if (dir) host.dir = dir;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    unmount: () => act(async () => root.unmount()),
    get group() {
      return host.querySelector<HTMLElement>('[data-ouro="resizable"]')!;
    },
    get panels() {
      return [...host.querySelectorAll<HTMLElement>('[data-ouro="resizable-panel"]')];
    },
    get handles() {
      return [...host.querySelectorAll<HTMLElement>('[role="separator"]')];
    },
  };
}

const widths = (panels: HTMLElement[]) => panels.map((panel) => Math.round(panel.getBoundingClientRect().width));
const heights = (panels: HTMLElement[]) => panels.map((panel) => Math.round(panel.getBoundingClientRect().height));

/** Two panels, files and editor, 30/70 by default. */
function Editor(props: Partial<Parameters<typeof Resizable>[0]>) {
  return (
    <Resizable {...props}>
      <ResizablePanel label="Files" defaultSize={30} minSize={20} maxSize={60}>
        Files
      </ResizablePanel>
      <ResizablePanel label="Editor">Editor</ResizablePanel>
    </Resizable>
  );
}

/** Drags a handle's center by (dx, dy) with a real mouse. */
async function dragHandle(handle: HTMLElement, dx: number, dy: number) {
  const rect = handle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await commands.drag({ from: [x, y], to: [x + dx, y + dy], steps: 8, durationMs: 160 });
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  localStorage.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  localStorage.clear();
});

describe("Resizable layout", () => {
  it("lays panels side by side at their default sizes with a handle between", async () => {
    const screen = await render(<Editor />);
    expect(screen.group.getAttribute("data-orientation")).toBe("horizontal");
    expect(screen.handles).toHaveLength(1);
    // 400px less the 1px handle, split 30/70.
    expect(widths(screen.panels)).toEqual([120, 279]);
    expect(heights(screen.panels)).toEqual([200, 200]);
  });

  it("stacks panels with orientation vertical", async () => {
    const screen = await render(<Editor orientation="vertical" />);
    expect(screen.group.getAttribute("data-orientation")).toBe("vertical");
    expect(heights(screen.panels)).toEqual([60, 139]);
    expect(screen.handles[0]!.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("shares the space left over between panels without a defaultSize", async () => {
    const screen = await render(
      <Resizable>
        <ResizablePanel label="A" defaultSize={50}>A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
        <ResizablePanel label="C">C</ResizablePanel>
      </Resizable>,
      { width: 402 },
    );
    expect(screen.handles).toHaveLength(2);
    expect(widths(screen.panels)).toEqual([200, 100, 100]);
  });

  it("lets app layout classes win on the group and panels", async () => {
    const screen = await render(
      <Resizable className="h-24">
        <ResizablePanel label="A" defaultSize={25} className="p-2">
          A
        </ResizablePanel>
        <ResizablePanel label="B" defaultSize={75}>
          B
        </ResizablePanel>
      </Resizable>,
    );
    // Default sizes that add up to 100 are taken as they are, without a warning.
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("25");
    expect(warn).not.toHaveBeenCalled();
    expect(screen.group.getBoundingClientRect().height).toBe(96);
    expect(getComputedStyle(screen.panels[0]!).paddingLeft).toBe("8px");
  });
});

describe("Resizable handle (window splitter)", () => {
  it("is a focusable separator for the panel before it", async () => {
    const screen = await render(<Editor />);
    const handle = screen.handles[0]!;
    expect(handle.tabIndex).toBe(0);
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-label")).toBe("Resize Files");
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
    expect(handle.getAttribute("aria-valuemin")).toBe("20");
    expect(handle.getAttribute("aria-valuemax")).toBe("60");
    expect(handle.getAttribute("aria-controls")).toBe(screen.panels[0]!.id);
    expect(screen.panels[0]!.id).not.toBe("");
  });

  it("names the handles with the handleLabel template", async () => {
    const screen = await render(<Editor handleLabel="Cambiar tamaño de {panel}" />);
    expect(screen.handles[0]!.getAttribute("aria-label")).toBe("Cambiar tamaño de Files");
  });

  it("resizes with the arrow keys, Home, End and Enter", async () => {
    const onLayout = vi.fn();
    const screen = await render(<Editor onLayout={onLayout} />);
    const handle = screen.handles[0]!;
    handle.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(handle.getAttribute("aria-valuenow")).toBe("40");
    expect(onLayout).toHaveBeenLastCalledWith([40, 60]);
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    // It stops at minSize.
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
    await userEvent.keyboard("{End}");
    expect(handle.getAttribute("aria-valuenow")).toBe("60");
    await userEvent.keyboard("{Home}");
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
    // Enter on a panel already at its minimum, with nothing to restore, keeps it there.
    await userEvent.keyboard("{Enter}");
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
    // Enter collapses the panel to its minimum and restores it.
    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
    await userEvent.keyboard("{Enter}");
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
    expect(widths(screen.panels)).toEqual([120, 279]);
    // Up and Down belong to a vertical group; here they do nothing.
    await userEvent.keyboard("{ArrowUp}{ArrowDown}");
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
  });

  it("reports nothing for a key press that changes nothing", async () => {
    const onLayout = vi.fn();
    const screen = await render(<Editor onLayout={onLayout} autoSaveId="editor" />);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    screen.handles[0]!.focus();
    await userEvent.keyboard("{End}{End}{End}{ArrowRight}");
    expect(onLayout.mock.calls).toEqual([[[60, 40]]]);
    expect(setItem).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Home}{ArrowLeft}{Home}");
    expect(onLayout.mock.calls).toEqual([[[60, 40]], [[20, 80]]]);
  });

  it("uses Up and Down in a vertical group", async () => {
    const screen = await render(<Editor orientation="vertical" />);
    const handle = screen.handles[0]!;
    handle.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(handle.getAttribute("aria-valuenow")).toBe("40");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
    await userEvent.keyboard("{ArrowRight}");
    expect(handle.getAttribute("aria-valuenow")).toBe("20");
  });

  it("swaps Left and Right in a right-to-left page", async () => {
    const screen = await render(<Editor />, { dir: "rtl" });
    const handle = screen.handles[0]!;
    handle.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(handle.getAttribute("aria-valuenow")).toBe("40");
    // The first panel is on the right.
    expect(screen.panels[0]!.getBoundingClientRect().left).toBeGreaterThan(screen.panels[1]!.getBoundingClientRect().left);
  });

  it("resizes when dragged with a pointer, within the panels' limits", async () => {
    const onLayout = vi.fn();
    const screen = await render(<Editor onLayout={onLayout} />);
    const handle = screen.handles[0]!;
    await dragHandle(handle, 80, 0);
    // 80px of 400px is 20%.
    await expect.poll(() => handle.getAttribute("aria-valuenow")).toBe("50");
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(widths(screen.panels)[0]).toBe(200);
    expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(false);
    await dragHandle(handle, 200, 0);
    await expect.poll(() => handle.getAttribute("aria-valuenow")).toBe("60");
  });

  it("drags downward in a vertical group and the other way in a right-to-left one", async () => {
    const vertical = await render(<Editor orientation="vertical" />, { height: 400 });
    await dragHandle(vertical.handles[0]!, 0, 40);
    await expect.poll(() => vertical.handles[0]!.getAttribute("aria-valuenow")).toBe("40");
    await vertical.unmount();
    const rtl = await render(<Editor />, { dir: "rtl" });
    await dragHandle(rtl.handles[0]!, -40, 0);
    await expect.poll(() => rtl.handles[0]!.getAttribute("aria-valuenow")).toBe("40");
  });

  it("marks the group while a drag is in progress, so text is not selected", async () => {
    const screen = await render(<Editor />);
    const handle = screen.handles[0]!;
    const rect = handle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    await commands.drag({ from: [x, y], to: [x + 20, y], steps: 4, durationMs: 80, hold: true });
    expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(true);
    expect(getComputedStyle(screen.group).userSelect).toBe("none");
    await commands.pointerPress({ action: "up" });
    await expect.poll(() => screen.group.hasAttribute("data-ouro-resizing")).toBe(false);
  });

  it("follows the pointer that took the handle and ignores a second one", async () => {
    const onLayout = vi.fn();
    const screen = await render(<Editor onLayout={onLayout} />);
    const handle = screen.handles[0]!;
    const rect = handle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const second = (type: string, clientX: number) => handle.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX, clientY: y, pointerId: 77 }));
    try {
      await commands.drag({ from: [x, y], to: [x + 20, y], steps: 4, durationMs: 80, hold: true });
      // 20px of 400px is 5%.
      expect(widths(screen.panels)[0]).toBe(140);
      // A second finger comes down 100px away, moves, and lifts: the panel stays with the first.
      await act(async () => {
        second("pointerdown", x + 120);
        second("pointermove", x + 160);
      });
      expect(widths(screen.panels)[0]).toBe(140);
      await act(async () => {
        second("pointerup", x + 160);
      });
      expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(true);
      expect(onLayout).not.toHaveBeenCalled();
      await act(async () => {
        second("pointercancel", x + 160);
      });
      expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(true);
      expect(widths(screen.panels)[0]).toBe(140);
    } finally {
      await commands.pointerPress({ action: "up" });
    }
    await expect.poll(() => screen.group.hasAttribute("data-ouro-resizing")).toBe(false);
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(handle.getAttribute("aria-valuenow")).toBe("35");
  });

  it("puts the sizes back when the browser cancels the drag, and reports no layout", async () => {
    const onLayout = vi.fn();
    const screen = await render(<Editor onLayout={onLayout} />);
    const handle = screen.handles[0]!;
    const rect = handle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let pointerId = -1;
    handle.addEventListener("pointerdown", (event) => (pointerId = event.pointerId), { once: true });
    try {
      await commands.drag({ from: [x, y], to: [x + 40, y], steps: 4, durationMs: 80, hold: true });
      expect(widths(screen.panels)[0]).toBe(160);
      await act(async () => {
        handle.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId }));
      });
      expect(widths(screen.panels)[0]).toBe(120);
      expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(false);
    } finally {
      await commands.pointerPress({ action: "up" });
    }
    expect(onLayout).not.toHaveBeenCalled();
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
  });

  it("lets go when it loses the pointer without a release, so the next press can drag", async () => {
    const onLayout = vi.fn();
    const screen = await render(<Editor onLayout={onLayout} />);
    const handle = screen.handles[0]!;
    const rect = handle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let pointerId = -1;
    handle.addEventListener("pointerdown", (event) => (pointerId = event.pointerId), { once: true });
    try {
      await commands.drag({ from: [x, y], to: [x + 40, y], steps: 4, durationMs: 80, hold: true });
      expect(widths(screen.panels)[0]).toBe(160);
      // The capture is gone with no pointerup or pointercancel, as when the handle is hidden mid-drag.
      await act(async () => {
        handle.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId: pointerId + 1 }));
      });
      expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(true);
      await act(async () => {
        handle.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId }));
      });
      expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(false);
      expect(widths(screen.panels)[0]).toBe(120);
    } finally {
      await commands.pointerPress({ action: "up" });
    }
    expect(onLayout).not.toHaveBeenCalled();
    // The handle is not left waiting for that pointer.
    await dragHandle(handle, 80, 0);
    await expect.poll(() => handle.getAttribute("aria-valuenow")).toBe("50");
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it("ignores a right-button press and moves that are not a drag", async () => {
    const screen = await render(<Editor />);
    const handle = screen.handles[0]!;
    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 300, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 300, pointerId: 1 }));
    expect(screen.group.hasAttribute("data-ouro-resizing")).toBe(false);
    expect(handle.getAttribute("aria-valuenow")).toBe("30");
  });

  it("does not report a layout for a press without a move", async () => {
    const onLayout = vi.fn();
    const screen = await render(<Editor onLayout={onLayout} />);
    await dragHandle(screen.handles[0]!, 0, 0);
    await expect.poll(() => screen.group.hasAttribute("data-ouro-resizing")).toBe(false);
    expect(onLayout).not.toHaveBeenCalled();
  });

  it("goes back to the default sizes when the number of panels changes", async () => {
    const three = (
      <Resizable>
        <ResizablePanel label="A" defaultSize={50}>A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
        <ResizablePanel label="C">C</ResizablePanel>
      </Resizable>
    );
    const screen = await render(<Editor />);
    screen.handles[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("40");
    await screen.rerender(three);
    expect(screen.handles.map((handle) => handle.getAttribute("aria-valuenow"))).toEqual(["50", "25"]);
  });

  it("gives the handle a hit area wider than its line", async () => {
    const screen = await render(<Editor />);
    const handle = screen.handles[0]!;
    const rect = handle.getBoundingClientRect();
    expect(rect.width).toBe(1);
    const cy = rect.top + rect.height / 2;
    expect(handle.contains(document.elementFromPoint(rect.left - 3, cy))).toBe(true);
    expect(handle.contains(document.elementFromPoint(rect.right + 3, cy))).toBe(true);
  });
});

describe("Resizable autoSaveId", () => {
  it("restores and saves the layout in localStorage", async () => {
    localStorage.setItem("ouro-resizable:editor", JSON.stringify([45, 55]));
    const screen = await render(<Editor autoSaveId="editor" />);
    await expect.poll(() => screen.handles[0]!.getAttribute("aria-valuenow")).toBe("45");
    screen.handles[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(JSON.parse(localStorage.getItem("ouro-resizable:editor")!)).toEqual([55, 45]);
  });

  it.each([
    ["not JSON", "{"],
    ["the wrong count", "[50, 25, 25]"],
    ["not adding up to 100", "[10, 10]"],
    ["not numbers", '["a", "b"]'],
    ["not a list", "42"],
  ])("ignores a saved layout that is %s", async (_name, saved) => {
    localStorage.setItem("ouro-resizable:editor", saved);
    const screen = await render(<Editor autoSaveId="editor" />);
    await act(async () => {});
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("30");
  });

  it.each([
    ["below the first panel's minSize", [5, 95], "20", [20, 80]],
    ["above the first panel's maxSize", [90, 10], "60", [60, 40]],
  ])("fits a saved layout %s into the panels' limits", async (_name, saved, now, sizes) => {
    localStorage.setItem("ouro-resizable:editor", JSON.stringify(saved));
    const onLayout = vi.fn();
    const screen = await render(<Editor autoSaveId="editor" onLayout={onLayout} />);
    const handle = screen.handles[0]!;
    await expect.poll(() => handle.getAttribute("aria-valuenow")).toBe(now);
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(Number(handle.getAttribute("aria-valuemin")));
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(Number(handle.getAttribute("aria-valuemax")));
    expect(widths(screen.panels)[0]).toBe(Math.round((399 * sizes[0]!) / 100));
  });

  it("hydrates server HTML at the default sizes, then applies the saved layout without a mismatch", async () => {
    const html = renderToString(
      <div style={{ width: 400, height: 200 }}>
        <Editor autoSaveId="editor" />
      </div>,
    );
    localStorage.setItem("ouro-resizable:editor", JSON.stringify([45, 55]));
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    expect(host.querySelector('[role="separator"]')!.getAttribute("aria-valuenow")).toBe("30");
    const error = vi.spyOn(console, "error");
    const recoverable = vi.fn();
    await act(async () => {
      roots.push(
        hydrateRoot(
          host,
          <div style={{ width: 400, height: 200 }}>
            <Editor autoSaveId="editor" />
          </div>,
          { onRecoverableError: recoverable },
        ),
      );
    });
    await expect.poll(() => host.querySelector('[role="separator"]')!.getAttribute("aria-valuenow")).toBe("45");
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps working when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const screen = await render(<Editor autoSaveId="editor" />);
    screen.handles[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("40");
  });

  it("follows a layout another tab saves", async () => {
    const screen = await render(<Editor autoSaveId="editor" />);
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("30");
    localStorage.setItem("ouro-resizable:editor", JSON.stringify([50, 50]));
    await act(async () => dispatchEvent(new StorageEvent("storage", { key: "ouro-resizable:editor" })));
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("50");
  });

  it("starts at the default sizes when nothing is saved yet", async () => {
    const screen = await render(<Editor autoSaveId="editor" />);
    await act(async () => {});
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("30");
    expect(localStorage.getItem("ouro-resizable:editor")).toBeNull();
  });

  it("does not touch storage without autoSaveId", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const screen = await render(<Editor />);
    screen.handles[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("Resizable parts", () => {
  it("builds the same splitter from ResizablePanelGroup and ResizableHandle", async () => {
    const screen = await render(
      <ResizablePanelGroup orientation="vertical" handleLabel="Drag {panel}">
        <ResizablePanel label="Preview" defaultSize={60}>Preview</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel label="Console">Console</ResizablePanel>
        <ResizableHandle aria-label="Resize the console and the log" />
        <ResizablePanel label="Log">Log</ResizablePanel>
      </ResizablePanelGroup>,
      { height: 202 },
    );
    expect(heights(screen.panels)).toEqual([120, 40, 40]);
    expect(screen.handles.map((handle) => handle.getAttribute("aria-label"))).toEqual(["Drag Preview", "Resize the console and the log"]);
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("60");
  });

  it("tells panels from handles by their props when the element type is a lazy reference, as across a Server Component boundary", async () => {
    // A Server Component's client elements can reach the group with a lazy type.
    const LazyPanel = lazy(async () => ({ default: ResizablePanel }));
    const LazyHandle = lazy(async () => ({ default: ResizableHandle }));
    const screen = await render(
      <Suspense fallback="Loading">
        <ResizablePanelGroup>
          <LazyPanel label="Files" defaultSize={30}>
            Files
          </LazyPanel>
          <LazyHandle />
          <LazyPanel label="Editor">Editor</LazyPanel>
        </ResizablePanelGroup>
      </Suspense>,
    );
    await expect.poll(() => screen.handles.length).toBe(1);
    expect(screen.handles[0]!.getAttribute("aria-label")).toBe("Resize Files");
    expect(screen.handles[0]!.getAttribute("aria-valuenow")).toBe("30");
    expect(widths(screen.panels)).toEqual([120, 279]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps an app's own panel id for aria-controls", async () => {
    const screen = await render(
      <Resizable>
        <ResizablePanel label="A" id="sidebar">A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
      </Resizable>,
    );
    expect(screen.panels[0]!.id).toBe("sidebar");
    expect(screen.handles[0]!.getAttribute("aria-controls")).toBe("sidebar");
  });

  it.each([
    ["ResizablePanel", <ResizablePanel key="p" label="A">A</ResizablePanel>, "must be a direct child of <ResizablePanelGroup> or <Resizable>"],
    ["ResizableHandle", <ResizableHandle key="h" />, "must be a direct child of <ResizablePanelGroup>"],
  ])("throws when %s is outside a group", async (part, node, problem) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(node)).rejects.toThrow(`[ouro-ui] ${part}: ${problem}`);
    error.mockRestore();
  });
});

describe("Resizable development messages", () => {
  it.each([
    [
      "direction",
      <Resizable key="d" {...({ direction: "vertical" } as object)}>
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
      </Resizable>,
      "Resizable",
      "direction is not a prop",
      '<Resizable orientation="vertical">',
    ],
    [
      "orientation",
      <Resizable key="o" {...({ orientation: "row" } as object)}>
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
      </Resizable>,
      "Resizable",
      'orientation="row" is not an orientation; use "horizontal", "vertical"',
      '<Resizable orientation="horizontal">',
    ],
    [
      "orientation column",
      <ResizablePanelGroup key="c" {...({ orientation: "column" } as object)}>
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel label="B">B</ResizablePanel>
      </ResizablePanelGroup>,
      "ResizablePanelGroup",
      'orientation="column" is not an orientation; use "horizontal", "vertical"',
      '<ResizablePanelGroup orientation="vertical">',
    ],
    [
      "one panel",
      <Resizable key="1">
        <ResizablePanel label="A">A</ResizablePanel>
      </Resizable>,
      "Resizable",
      "it needs at least two panels",
      '<Resizable><ResizablePanel label="Files">…</ResizablePanel><ResizablePanel label="Editor">…</ResizablePanel></Resizable>',
    ],
    [
      "a handle in Resizable",
      <Resizable key="h">
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel label="B">B</ResizablePanel>
      </Resizable>,
      "Resizable",
      "Resizable adds the handles itself",
      "remove <ResizableHandle />, or use <ResizablePanelGroup> to place handles yourself",
    ],
    [
      "sizes over 100",
      <Resizable key="s">
        <ResizablePanel label="A" defaultSize={70}>A</ResizablePanel>
        <ResizablePanel label="B" defaultSize={50}>B</ResizablePanel>
      </Resizable>,
      "Resizable",
      "the defaultSize values add up to 120, not 100",
      '<ResizablePanel label="…" defaultSize={30}> and leave one panel without defaultSize to take the rest',
    ],
    [
      "a missing label",
      <Resizable key="l">
        <ResizablePanel {...({} as { label: string })}>A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
      </Resizable>,
      "ResizablePanel",
      "label is required; it names the handle that resizes the panel",
      '<ResizablePanel label="Files">',
    ],
    [
      "withHandle",
      <ResizablePanelGroup key="w">
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizableHandle {...({ withHandle: true } as object)} />
        <ResizablePanel label="B">B</ResizablePanel>
      </ResizablePanelGroup>,
      "ResizableHandle",
      "withHandle is not a prop; the handle always shows its grip",
      "<ResizableHandle />",
    ],
    [
      "a handle at the edge",
      <ResizablePanelGroup key="e">
        <ResizableHandle />
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
      </ResizablePanelGroup>,
      "ResizableHandle",
      "it must sit between two panels",
      '<ResizablePanel label="A">…</ResizablePanel><ResizableHandle /><ResizablePanel label="B">…</ResizablePanel>',
    ],
    [
      "other children",
      <ResizablePanelGroup key="c">
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizableHandle />
        <div>stray</div>
        stray text
        <ResizablePanel label="B">B</ResizablePanel>
      </ResizablePanelGroup>,
      "ResizablePanelGroup",
      "its children must be ResizablePanel and ResizableHandle elements",
      "move other content inside a <ResizablePanel>",
    ],
  ])("warns for %s with the fix", async (_name, node, component, problem, fix) => {
    await render(node);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ${component}: ${problem}. Fix: ${fix}.`);
  });

  it("renders horizontal for an unknown orientation and skips a misplaced handle", async () => {
    const screen = await render(
      <ResizablePanelGroup {...({ orientation: "diagonal" } as object)}>
        <ResizableHandle />
        <ResizablePanel label="A">A</ResizablePanel>
        <ResizablePanel label="B">B</ResizablePanel>
      </ResizablePanelGroup>,
    );
    expect(screen.group.getAttribute("data-orientation")).toBe("horizontal");
    expect(screen.handles).toHaveLength(0);
  });

  it.each([
    ["Resizable", "bg-muted"],
    ["ResizablePanel", "bg-muted"],
  ])("checks the className on %s", async (component, className) => {
    await render(
      component === "Resizable" ? (
        <Resizable className={className}>
          <ResizablePanel label="A">A</ResizablePanel>
          <ResizablePanel label="B">B</ResizablePanel>
        </Resizable>
      ) : (
        <Resizable>
          <ResizablePanel label="A" className={className}>A</ResizablePanel>
          <ResizablePanel label="B">B</ResizablePanel>
        </Resizable>
      ),
    );
    expect(warn).toHaveBeenCalledWith(
      `[ouro-ui] ${component}: "${className}" sets appearance, and className is for layout only. Fix: remove "${className}"; style the content you put in the panels.`,
    );
  });

  it("renders to a string with sizes and the separator's values, without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<Editor autoSaveId="editor" />);
    expect(html).toContain('data-ouro="resizable"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain("flex-grow:30");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
