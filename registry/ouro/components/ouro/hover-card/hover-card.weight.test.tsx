import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { HoverCard } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A chat may put a person's card on every author's face, so what a HoverCard mounts before anyone hovers it is paid
// once per message as the chat opens. Each budget is what the variant draws now: a change that adds to one fails here.

const variants: { variant: string; card: ReactElement; elements: number; components: number }[] = [
  { variant: "a link", card: <HoverCard trigger={<a href="#cooks/ari">Ari Mendelow</a>}>Cooks mostly Persian food.</HoverCard>, elements: 1, components: 1 },
  {
    variant: "an author's face",
    card: (
      <HoverCard trigger={<a href="#people/ana" aria-label="Ana Lind's profile"><Avatar name="Ana Lind" alt="" size="sm" /></a>}>Ana Lind, design</HoverCard>
    ),
    elements: 4,
    components: 2,
  },
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

describe("HoverCard's weight", () => {
  it.each(variants)("draws $variant, unhovered, in no more than $elements elements and $components components", async ({ card, elements, components }) => {
    const host = document.createElement("div");
    host.dataset["testHarness"] = "";
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(card));
    const drawnElements = host.querySelectorAll("*").length;
    const drawnComponents = componentsUnder(host);
    await act(async () => root.unmount());
    host.remove();
    expect(drawnElements, "elements").toBeLessThanOrEqual(elements);
    expect(drawnComponents, "components").toBeLessThanOrEqual(components);
  });
});
