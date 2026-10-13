import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Calendar } from "@/registry/ouro/components/ouro/calendar/calendar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

it("gives Calendar's days and month buttons 44px touch targets", async () => {
  const host = await render(<Calendar label="Delivery date" defaultValue="2026-10-11" />);
  const dayBox = host.querySelector('[data-ouro-day="2026-10-11"]')!.getBoundingClientRect();
  expect(dayBox.width).toBeGreaterThanOrEqual(44);
  expect(dayBox.height).toBeGreaterThanOrEqual(44);
  for (const name of ["Previous month", "Next month"]) {
    const button = host.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;
    const box = button.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    for (const [x, y] of [
      [cx, cy - 21],
      [cx, cy + 21],
      [cx - 21, cy],
      [cx + 21, cy],
    ] as const) {
      expect(document.elementFromPoint(x, y)?.closest("button")).toBe(button);
    }
  }
  // Seven 44px columns fit a 390px phone.
  expect(host.querySelector<HTMLElement>('[data-ouro="calendar"]')!.getBoundingClientRect().width).toBeLessThanOrEqual(390 - 48);
});
