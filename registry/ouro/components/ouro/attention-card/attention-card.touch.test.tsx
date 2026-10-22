import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { AttentionCard } from "@/registry/ouro/components/ouro/attention-card/attention-card";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives an AttentionCard's message a target at least 44px square to a finger", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AttentionCard reason="Asked you" title="Design review" from="Ada" onOpen={() => {}}>
        OK?
      </AttentionCard>,
    ),
  );
  const open = host.querySelector<HTMLElement>('[data-ouro-control="attention-card"]')!;
  const target = open.querySelector<HTMLElement>("[data-ouro-touch-target]")!;
  const rect = target.getBoundingClientRect();
  expect(rect.height).toBeGreaterThanOrEqual(44);
  expect(rect.width).toBeGreaterThanOrEqual(44);
});
