import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";
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
  host.style.width = "320px";
  host.style.padding = "40px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

describe("MediaTile on a touch screen", () => {
  it("always shows its controls, and gives the Pin toggle a 44px target", async () => {
    expect(matchMedia("(pointer: coarse)").matches).toBe(true);
    const host = await render(<MediaTile name="Mara Lind" onPinnedChange={() => {}} />);
    const controls = host.querySelector<HTMLElement>("[data-ouro-media-tile-controls]")!;
    expect(getComputedStyle(controls).opacity).toBe("1");
    const pin = host.querySelector<HTMLElement>('[data-ax-action="pin"]')!;
    expect(pin.getBoundingClientRect().height).toBeLessThan(44);
    const target = pin.querySelector<HTMLElement>("[data-ouro-touch-target]")!.getBoundingClientRect();
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    // A press anywhere in the target reaches the toggle.
    const hit = document.elementFromPoint(target.left + 1, target.top + 1);
    expect(pin.contains(hit)).toBe(true);
  });
});
