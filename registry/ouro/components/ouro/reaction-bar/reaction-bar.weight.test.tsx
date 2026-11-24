import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ReactionBar } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A chat draws a reaction bar under every message with reactions, so its count of elements and components is paid
// once per such message. Each budget is what the variant draws now: a change that adds to one fails here.

const reactions = [
  { key: "like", label: "Like", emoji: "👍", count: 2 },
  { key: "heart", label: "Heart", emoji: "❤️", count: 1, mine: true, tooltip: "You" },
];
const react = () => {};

const variants: { variant: string; bar: ReactElement; elements: number; components: number }[] = [
  { variant: "read-only reactions", bar: <ReactionBar reactions={reactions} />, elements: 11, components: 6 },
  { variant: "reactions anyone can press", bar: <ReactionBar reactions={reactions} onReact={react} />, elements: 12, components: 12 },
  { variant: "read-only reactions with Add reaction", bar: <ReactionBar reactions={reactions} onMore={react} />, elements: 22, components: 12 },
  { variant: "reactions with Add reaction", bar: <ReactionBar reactions={reactions} onReact={react} onMore={react} />, elements: 23, components: 18 },
];

/** The components React keeps for what the root draws: every fiber but the root, elements and text, context providers included. */
function componentsUnder(host: HTMLElement): number {
  const key = Object.keys(host).find((name) => name.startsWith("__reactContainer$"))!;
  // React's fibers: 3 is the root, 5 an element, 6 a text node; everything else is a component, provider or fragment.
  type Fiber = { tag: number; child: Fiber | null; sibling: Fiber | null; stateNode: { current: Fiber } };
  const count = (fiber: Fiber | null): number => (fiber === null ? 0 : (fiber.tag === 5 || fiber.tag === 6 ? 0 : 1) + count(fiber.child) + count(fiber.sibling));
  // The container keeps the root's first fiber; the tree on screen hangs from the root's current one.
  return count((host as unknown as Record<string, Fiber>)[key]!.stateNode.current.child);
}

describe("ReactionBar's weight", () => {
  it.each(variants)("draws $variant in no more than $elements elements and $components components", async ({ bar, elements, components }) => {
    const host = document.createElement("div");
    host.dataset["testHarness"] = "";
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(bar));
    const drawnElements = host.querySelectorAll("*").length;
    const drawnComponents = componentsUnder(host);
    await act(async () => root.unmount());
    host.remove();
    expect(drawnElements, "elements").toBeLessThanOrEqual(elements);
    expect(drawnComponents, "components").toBeLessThanOrEqual(components);
  });
});
