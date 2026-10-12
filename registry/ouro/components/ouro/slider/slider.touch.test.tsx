import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await page.viewport(390, 844);
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.cssText = "padding:24px;width:320px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

it("gives the thumb a 44px hit area and the control a 44px height, also on a landscape phone", async () => {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
  ] as const) {
    await page.viewport(width, height);
    const host = await render(<Slider label="Volume" defaultValue={50} />);
    expect(host.querySelector<HTMLElement>("[data-ouro-slider-control]")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    const thumb = host.querySelector<HTMLElement>("[data-ouro-slider-thumb]")!;
    const rect = thumb.getBoundingClientRect();
    expect(rect.height).toBeLessThan(44);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (const [dx, dy] of [
      [0, -21],
      [0, 21],
      [-21, 0],
      [21, 0],
    ] as const) {
      expect(thumb.contains(document.elementFromPoint(cx + dx, cy + dy))).toBe(true);
    }
    await act(async () => root!.unmount());
  }
});

it("follows a finger dragged along the track, and commits once on lift", async () => {
  const onValueChange = vi.fn();
  const onValueCommitted = vi.fn();
  const host = await render(<Slider label="Volume" defaultValue={0} onValueChange={onValueChange} onValueCommitted={onValueCommitted} />);
  const rect = host.querySelector<HTMLElement>("[data-ouro-slider-thumb]")!.getBoundingClientRect();
  const track = host.querySelector<HTMLElement>("[data-ouro-slider-control]")!.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  await commands.touchDrag({ from: [rect.left + rect.width / 2, y], to: [track.left + track.width / 2, y], steps: 8 });
  await expect.poll(() => onValueChange.mock.lastCall?.[0]).toBeGreaterThan(30);
  await expect.poll(() => onValueCommitted.mock.calls.length).toBe(1);
  expect(onValueCommitted.mock.lastCall?.[0]).toBe(onValueChange.mock.lastCall?.[0]);
});

it("hands a vertical finger drag over the slider to the page (pan-y), without moving the thumb", async () => {
  const onValueChange = vi.fn();
  const host = await render(
    <div style={{ paddingBlock: "300px 2000px" }}>
      <Slider label="Volume" defaultValue={50} onValueChange={onValueChange} />
    </div>,
  );
  const control = host.querySelector<HTMLElement>("[data-ouro-slider-control]")!;
  expect(getComputedStyle(control).touchAction).toBe("pan-y");
  const rect = host.querySelector<HTMLElement>("[data-ouro-slider-thumb]")!.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  // `touch-action: pan-y` is what hands a vertical pan to the page. Whether the page then
  // scrolls depends on compositor timing that a CI runner does not reproduce reliably, so this
  // checks the declaration and that the drag leaves the value alone, not the scroll offset.
  await commands.touchDrag({ from: [x, y], to: [x, y - 200], steps: 12 });
  expect(onValueChange.mock.calls.every(([value]) => value === 50)).toBe(true);
  expect(host.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe("50");
});
