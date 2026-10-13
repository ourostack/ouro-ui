import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { Resizable, ResizablePanel } from "@/registry/ouro/components/ouro/resizable/resizable";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  scrollTo(0, 0);
  await rotate(390, 844);
});

/** A 300px-tall split in a page tall enough to scroll. */
async function renderSplit(onLayout = vi.fn(), orientation: "horizontal" | "vertical" = "horizontal") {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <div style={{ padding: 16 }}>
        <div style={{ height: 300 }}>
          <Resizable onLayout={onLayout} orientation={orientation}>
            <ResizablePanel label="Files" defaultSize={40}>
              Files
            </ResizablePanel>
            <ResizablePanel label="Editor">Editor</ResizablePanel>
          </Resizable>
        </div>
        <div style={{ height: 1600 }} />
      </div>,
    ),
  );
  const handle = host.querySelector<HTMLElement>('[role="separator"]')!;
  return { host, handle, onLayout };
}

/** Whether a tap at (x, y) lands on `target`. */
const hits = (target: Element, x: number, y: number) => target.contains(document.elementFromPoint(x, y));

it.each([
  ["portrait", 390, 844],
  ["landscape", 844, 390],
])("gives the 1px handle a 44px touch target in %s", async (_name, width, height) => {
  await rotate(width, height);
  const { handle } = await renderSplit();
  const rect = handle.getBoundingClientRect();
  expect(rect.width).toBe(1);
  const cx = rect.left + rect.width / 2;
  const cy = Math.min(rect.top + rect.height / 2, innerHeight / 2);
  expect(hits(handle, cx - 21, cy) && hits(handle, cx + 21, cy)).toBe(true);
});

it("resizes with a touch drag instead of scrolling the page", async () => {
  const { handle, onLayout } = await renderSplit();
  // Sideways is the handle's; up and down stays the page's.
  expect(getComputedStyle(handle).touchAction).toBe("pan-y");
  const rect = handle.getBoundingClientRect();
  // Start 15px beside the line, inside the touch target, and drag right and a little down.
  const x = rect.left + 15;
  const y = rect.top + 100;
  await commands.touchDrag({ from: [x, y], to: [x + 72, y + 30], steps: 10 });
  await expect.poll(() => onLayout.mock.calls.length).toBe(1);
  // 72px of the 357px the panels share is about 20%.
  expect(Number(handle.getAttribute("aria-valuenow"))).toBe(60);
  expect(scrollY).toBe(0);
});

it("resizes a vertical split with a drag down, and leaves a sideways swipe to the page", async () => {
  const { handle, onLayout } = await renderSplit(vi.fn(), "vertical");
  expect(getComputedStyle(handle).touchAction).toBe("pan-x");
  const rect = handle.getBoundingClientRect();
  const x = rect.left + 100;
  const y = rect.top + 15;
  await commands.touchDrag({ from: [x, y], to: [x + 20, y + 60], steps: 10 });
  await expect.poll(() => onLayout.mock.calls.length).toBe(1);
  // 60px of the 299px the panels share is about 20%.
  expect(Number(handle.getAttribute("aria-valuenow"))).toBe(60);
});

it("lets a vertical swipe that starts on the handle scroll the page, and leaves the sizes alone", async () => {
  const { handle, onLayout } = await renderSplit();
  const rect = handle.getBoundingClientRect();
  const x = rect.left + 15;
  const y = rect.top + 200;
  // Up, and a little sideways as a thumb goes: the browser takes it for a scroll and cancels the pointer.
  await commands.touchDrag({ from: [x, y], to: [x + 6, y - 160], steps: 10 });
  await expect.poll(() => scrollY).toBeGreaterThan(100);
  expect(handle.getAttribute("aria-valuenow")).toBe("40");
  expect(handle.closest('[data-ouro="resizable"]')!.hasAttribute("data-ouro-resizing")).toBe(false);
  expect(onLayout).not.toHaveBeenCalled();
  // Let the scroll come to a stop, so its momentum does not take the next test's first touch.
  let last = -1;
  await expect
    .poll(
      () => {
        const still = scrollY === last;
        last = scrollY;
        return still;
      },
      { interval: 100 },
    )
    .toBe(true);
});
