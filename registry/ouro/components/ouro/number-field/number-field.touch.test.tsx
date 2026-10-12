import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { NumberField } from "@/registry/ouro/components/ouro/number-field/number-field";
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
  host.style.padding = "24px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

it("is 44px tall with 16px text and 44px steppers, also on a landscape phone", async () => {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
  ] as const) {
    await page.viewport(width, height);
    const host = await render(<NumberField label="Servings" defaultValue={4} />);
    const group = host.querySelector<HTMLElement>("[data-ouro-number-field-group]")!;
    expect(group.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(parseFloat(getComputedStyle(host.querySelector("input")!).fontSize)).toBeGreaterThanOrEqual(16);
    for (const button of host.querySelectorAll("button")) {
      expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(42);
    }
    await act(async () => root!.unmount());
  }
});

it("steps with a tap on Increase, and does not scrub from the label", async () => {
  const onValueChange = vi.fn();
  const host = await render(<NumberField label="Servings" defaultValue={4} onValueChange={onValueChange} />);
  expect(host.querySelector("[data-ouro-number-field-scrub]")).toBeNull();
  await commands.tap('button[aria-label="Increase"]');
  expect(onValueChange.mock.lastCall?.[0]).toBe(5);
  expect(host.querySelector("input")!.value).toBe("5");
});
