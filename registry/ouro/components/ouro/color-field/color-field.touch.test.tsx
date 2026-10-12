import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ColorField } from "@/registry/ouro/components/ouro/color-field/color-field";
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
  host.style.padding = "40px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

it("gives the swatch a 44px hit area that opens the picker", async () => {
  const host = await render(<ColorField label="Color" />);
  const picker = host.querySelector<HTMLInputElement>('input[type="color"]')!;
  const rect = picker.getBoundingClientRect();
  expect(rect.height).toBeLessThan(44);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (const [x, y] of [
    [cx, cy - 21],
    [cx, cy + 21],
    [cx - 21, cy],
  ] as const) {
    // The hit area is inside the swatch's label, so a press there opens the picker.
    expect(document.elementFromPoint(x, y)?.closest("label")?.control).toBe(picker);
  }
});

it("keeps a 44px box and 16px text on a landscape phone, past the sm breakpoint", async () => {
  await page.viewport(844, 390);
  const host = await render(<ColorField label="Color" />);
  expect(host.querySelector<HTMLElement>("[data-ouro-input-group]")!.getBoundingClientRect().height).toBe(44);
  expect(getComputedStyle(host.querySelector('input[type="text"]')!).fontSize).toBe("16px");
});
