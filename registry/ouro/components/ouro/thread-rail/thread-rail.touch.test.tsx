import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives the close button a 44px target on a coarse pointer", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<ThreadRail label="Thread" onClose={() => {}} />));
  const target = host.querySelector<HTMLElement>('[data-ouro-part="close"] [data-ouro-touch-target]')!;
  const rect = target.getBoundingClientRect();
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
});
