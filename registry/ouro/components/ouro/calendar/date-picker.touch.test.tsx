import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { DatePicker } from "@/registry/ouro/components/ouro/calendar/date-picker";
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

it("uses the phone's own date picker on a touch screen, submitting the ISO date", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = await render(
    <form>
      <DatePicker label="Delivery date" name="delivery" defaultValue="2026-10-11" />
    </form>,
  );
  const input = host.querySelector("input")!;
  expect(input.type).toBe("date");
  expect(input.value).toBe("2026-10-11");
  expect(host.querySelector('button[aria-label="Choose date"]')).toBeNull();
  expect(Object.fromEntries(new FormData(host.querySelector("form")!))).toEqual({ delivery: "2026-10-11" });
  // 16px text, so iOS does not zoom on focus, and a 44px box.
  expect(parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
  expect(host.querySelector<HTMLElement>("[data-ouro-input-group]")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

it("keeps the native picker, 16px text and a 44px box on a landscape phone, past the sm breakpoint", async () => {
  await page.viewport(844, 390);
  expect(matchMedia("(min-width: 640px)").matches).toBe(true);
  const host = await render(<DatePicker label="Delivery date" />);
  const input = host.querySelector("input")!;
  expect(input.type).toBe("date");
  expect(parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
  expect(host.querySelector<HTMLElement>("[data-ouro-input-group]")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});
