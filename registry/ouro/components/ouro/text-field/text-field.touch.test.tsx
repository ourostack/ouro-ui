import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
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

it("uses 16px text in TextField and TextArea, so iOS does not zoom on focus", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = await render(
    <>
      <TextField label="Email" type="email" />
      <TextField label="Price" startAdornment="$" />
      <TextArea label="Notes" autoGrow />
    </>,
  );
  for (const control of host.querySelectorAll("input, textarea")) {
    expect(parseFloat(getComputedStyle(control).fontSize)).toBeGreaterThanOrEqual(16);
  }
});

it("keeps focus and the cursor in the input when the password toggle is tapped", async () => {
  const host = await render(<TextField label="Password" type="password" defaultValue="hunter22" />);
  const input = host.querySelector("input")!;
  await commands.tap("input");
  input.setSelectionRange(4, 4);
  await commands.tap('button[aria-label="Show password"]');
  expect(input.type).toBe("text");
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([4, 4]);
});

it("refocuses the input when the clear button is tapped", async () => {
  const host = await render(<TextField label="Search" type="search" clearable defaultValue="pasta" />);
  const input = host.querySelector("input")!;
  await commands.tap('button[aria-label="Clear"]');
  expect(input.value).toBe("");
  expect(document.activeElement).toBe(input);
});

it("gives the toggle a 44px hit area, though it is smaller than the box", async () => {
  const host = await render(<TextField label="Password" type="password" />);
  const toggle = host.querySelector<HTMLElement>('button[aria-label="Show password"]')!;
  const rect = toggle.getBoundingClientRect();
  expect(rect.height).toBeLessThan(44);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (const [x, y] of [
    [cx, cy - 21],
    [cx, cy + 21],
  ] as const) {
    expect(document.elementFromPoint(x, y)?.closest("button")).toBe(toggle);
  }
});
