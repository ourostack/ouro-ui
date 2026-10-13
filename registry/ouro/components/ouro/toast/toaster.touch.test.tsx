import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await commands.touchStep({ type: "touchEnd" });
  await act(async () => toast.dismiss());
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await rotate(390, 844);
});

async function renderToaster() {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<Toaster />));
}

const toastNamed = (message: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-ouro="toast"]')].find(
    (item) => item.querySelector("[data-ouro-toast-title]")?.textContent === message,
  );

async function show(message: string, options?: Parameters<typeof toast>[1]) {
  await act(async () => {
    toast(message, options);
  });
  await expect.poll(() => toastNamed(message)).toBeDefined();
  const item = toastNamed(message)!;
  await expect.poll(() => item.getAnimations().length).toBe(0);
  return item;
}

/** Whether a tap at (x, y) lands on `target`. */
const hits = (target: Element, x: number, y: number) => target.contains(document.elementFromPoint(x, y));

it("spans the phone's width at the bottom, inside a 16px margin", async () => {
  await renderToaster();
  const rect = (await show("Saved", { duration: 0 })).getBoundingClientRect();
  expect(rect.left).toBe(16);
  expect(rect.right).toBe(innerWidth - 16);
  expect(innerHeight - rect.bottom).toBeGreaterThanOrEqual(16);
});

it.each([
  ["down", 0, 140],
  ["right", 220, 0],
  ["left", -220, 0],
] as const)("dismisses with a real touch swipe %s", async (direction, dx, dy) => {
  await renderToaster();
  const message = `Swipe ${direction}`;
  const item = await show(message, { duration: 0 });
  // The page must not take the swipe for a scroll: that cancels the pointer and the toast stays.
  expect(getComputedStyle(item).touchAction).toBe("none");
  const rect = item.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await commands.touchDrag({ from: [x, y], to: [x + dx, y + dy], steps: 10 });
  await expect.poll(() => toastNamed(message)).toBeUndefined();
});

it("dismisses with a swipe down on a page that scrolls, without scrolling it", async () => {
  const tall = document.createElement("div");
  tall.style.height = "3000px";
  document.body.append(tall);
  nodes.push(tall);
  scrollTo(0, 400);
  await renderToaster();
  const item = await show("Swipe on a long page", { duration: 0 });
  const rect = item.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await commands.touchDrag({ from: [x, y], to: [x, y + 140], steps: 10 });
  await expect.poll(() => toastNamed("Swipe on a long page")).toBeUndefined();
  expect(scrollY).toBe(400);
  scrollTo(0, 0);
});

/** A tap with no wait before it: touch input straight at the element's middle. Playwright's own tap first waits for the element to hold still. */
async function tapNow(element: Element) {
  const rect = element.getBoundingClientRect();
  await commands.touchStep({ type: "touchStart", x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  await commands.touchStep({ type: "touchEnd" });
}

it("gets the click of a tap on its action right after a flick that does not dismiss it", async () => {
  const undo = vi.fn();
  await renderToaster();
  const item = await show("Recipe deleted", { duration: 0, action: { label: "Undo", onClick: undo } });
  const rect = item.getBoundingClientRect();
  const x = rect.left + 60;
  const y = rect.top + rect.height / 2;
  // A fast flick up, the one way a toast cannot leave: it comes back. Chromium would start a
  // fling when a fast swipe ends, although nothing scrolls, and the tap that stops a fling
  // gets no click.
  await commands.touchDrag({ from: [x, y], to: [x, y - 120], steps: 10, durationMs: 100 });
  expect(toastNamed("Recipe deleted")).toBe(item);
  await tapNow([...item.querySelectorAll("button")].find((button) => button.textContent === "Undo")!);
  await expect.poll(() => undo.mock.calls.length).toBe(1);
});

it("gives the dismiss and action buttons 44px touch targets", async () => {
  await renderToaster();
  const item = await show("Recipe deleted", { duration: 0, action: { label: "Undo", onClick: () => {} } });
  for (const button of item.querySelectorAll("button")) {
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    expect(hits(button, cx, cy - 21) && hits(button, cx, cy + 21)).toBe(true);
    expect(hits(button, cx - 21, cy) && hits(button, cx + 21, cy)).toBe(true);
  }
  // 16px text on the action, as for every control on a coarse pointer.
  const undo = [...item.querySelectorAll("button")].find((button) => button.textContent === "Undo")!;
  expect(getComputedStyle(undo).fontSize).toBe("16px");
});

it("keeps the phone layout and touch sizes on a landscape phone", async () => {
  await rotate(844, 390);
  await renderToaster();
  const item = await show("Landscape", { duration: 0, action: { label: "Undo", onClick: () => {} } });
  const undo = [...item.querySelectorAll("button")].find((button) => button.textContent === "Undo")!;
  expect(getComputedStyle(undo).fontSize).toBe("16px");
  expect(item.getBoundingClientRect().width).toBe(360);
});
