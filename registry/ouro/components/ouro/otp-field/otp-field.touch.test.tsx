import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { OtpField } from "@/registry/ouro/components/ouro/otp-field/otp-field";
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

it("fits six 44px slots with 16px text on a 390px phone", async () => {
  const host = await render(<OtpField label="Code" />);
  const slots = [...host.querySelectorAll<HTMLInputElement>("input[data-ouro-otp-slot]")];
  expect(slots).toHaveLength(6);
  for (const slot of slots) {
    expect(slot.getBoundingClientRect().height).toBe(44);
    expect(slot.getBoundingClientRect().right).toBeLessThanOrEqual(390);
    expect(getComputedStyle(slot).fontSize).toBe("16px");
  }
});

it("keeps 44px slots and 16px text on a landscape phone, past the sm breakpoint", async () => {
  await page.viewport(844, 390);
  const host = await render(<OtpField label="Code" />);
  const slot = host.querySelector<HTMLInputElement>("input[data-ouro-otp-slot]")!;
  expect(slot.getBoundingClientRect().height).toBe(44);
  expect(getComputedStyle(slot).fontSize).toBe("16px");
});

it("focuses the next empty slot when any slot is tapped", async () => {
  const host = await render(<OtpField label="Code" defaultValue="12" />);
  const slots = [...host.querySelectorAll<HTMLInputElement>("input[data-ouro-otp-slot]")];
  await commands.tap("input[data-ouro-otp-slot]:last-of-type");
  expect(document.activeElement).toBe(slots[2]);
});
