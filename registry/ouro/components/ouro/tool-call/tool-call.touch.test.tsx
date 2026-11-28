import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ToolCall } from "@/registry/ouro/components/ouro/tool-call/tool-call";
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
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

describe("ToolCall on a touch screen", () => {
  it("makes a row with output and one without 44px tall", async () => {
    expect(matchMedia("(pointer: coarse)").matches).toBe(true);
    const host = await render(
      <>
        <ToolCall name="Ran command" detail="npm test" status="done" output="ok" />
        <ToolCall name="Read file" detail="recipes/roast.md" status="done" />
      </>,
    );
    const [withOutput, plain] = [...host.querySelectorAll<HTMLElement>('[data-ouro="tool-call"]')];
    expect(withOutput!.querySelector("button")!.getBoundingClientRect().height).toBe(44);
    expect(plain!.getBoundingClientRect().height).toBe(44);
  });
});
