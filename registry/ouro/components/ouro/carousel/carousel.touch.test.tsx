import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { Carousel } from "@/registry/ouro/components/ouro/carousel/carousel";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
const cleanups: Array<() => void> = [];
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Waits until a swipe's momentum has stopped scrolling the page: two frames agree. */
async function pageAtRest() {
  await expect
    .poll(async () => {
      const before = scrollY;
      await frame();
      await frame();
      return scrollY === before;
    })
    .toBe(true);
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await pageAtRest();
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  scrollTo(0, 0);
  await page.viewport(390, 844);
});

/** A carousel between two tall blocks, so the page itself can scroll. */
async function renderInPage(onIndexChange = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <div style={{ padding: 16 }}>
        <div style={{ height: 300 }} />
        <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ height: 200 }}>
              Photo {n}
            </div>
          ))}
        </Carousel>
        <div style={{ height: 1600 }} />
      </div>,
    ),
  );
  const viewport = host.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")!;
  return { host, viewport, onIndexChange };
}

/** Records whether any touch event's default was prevented, after every handler in the page ran. */
function watchTouchDefaults(): { prevented: () => boolean; moves: () => number } {
  let prevented = false;
  let moves = 0;
  const listener = (event: TouchEvent) => {
    if (event.type === "touchmove") moves++;
    if (event.defaultPrevented) prevented = true;
  };
  for (const type of ["touchstart", "touchmove", "touchend"] as const) addEventListener(type, listener);
  cleanups.push(() => {
    for (const type of ["touchstart", "touchmove", "touchend"] as const) removeEventListener(type, listener);
  });
  return { prevented: () => prevented, moves: () => moves };
}

/** Whether a tap at (x, y) lands on `target`. */
const hits = (target: Element, x: number, y: number) => target.contains(document.elementFromPoint(x, y));

it("lets a vertical swipe that starts on the slides scroll the page", async () => {
  const { viewport } = await renderInPage();
  const touches = watchTouchDefaults();
  expect(getComputedStyle(viewport).touchAction).toBe("auto");
  const rect = viewport.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await commands.touchDrag({ from: [x, y + 80], to: [x, y - 120], steps: 12 });
  await expect.poll(() => scrollY).toBeGreaterThan(50);
  expect(touches.moves()).toBeGreaterThan(0);
  expect(touches.prevented()).toBe(false);
  expect(viewport.scrollLeft).toBe(0);
});

it("moves to the next slide with a horizontal swipe and reports it once", async () => {
  const { viewport, onIndexChange } = await renderInPage();
  const touches = watchTouchDefaults();
  const rect = viewport.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const pageY = scrollY;
  await commands.touchDrag({ from: [rect.right - 40, y], to: [rect.left + 40, y], steps: 12 });
  await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
  expect(touches.prevented()).toBe(false);
  // The swipe moved the slides, not the page.
  expect(scrollY).toBe(pageY);
});

it.each([
  ["portrait", 390, 844],
  ["landscape", 844, 390],
])("gives Previous and Next 44px touch targets in %s", async (_name, width, height) => {
  await page.viewport(width, height);
  const { host } = await renderInPage();
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("[data-ouro-carousel-buttons] button")];
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Previous slide", "Next slide"]);
  // Next is enabled, so it takes taps; Previous is disabled on the first slide but keeps its size.
  const next = buttons[1]!;
  next.scrollIntoView({ block: "center" });
  const rect = next.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  expect(hits(next, cx, cy - 21) && hits(next, cx, cy + 21)).toBe(true);
  expect(hits(next, cx - 21, cy) && hits(next, cx + 21, cy)).toBe(true);
});
