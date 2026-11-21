import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PreviewBar } from "@/registry/ouro/components/ouro/preview-bar/preview-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives Compare, Throw away and Keep targets at least 44px square to a finger", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<PreviewBar label="Trying the Ocean theme" onKeep={vi.fn()} onDiscard={vi.fn()} onCompareChange={vi.fn()} />));
  const buttons = host.querySelectorAll<HTMLElement>('[data-ouro-control="preview-bar"]');
  expect(buttons).toHaveLength(3);
  for (const button of buttons) {
    const target = button.querySelector<HTMLElement>("[data-ouro-touch-target]") ?? button;
    const rect = target.getBoundingClientRect();
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
  }
});
