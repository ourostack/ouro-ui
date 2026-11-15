import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Lightbox } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A chat draws a Lightbox for a message's pictures, so what one mounts before anyone opens it is paid once per such
// message as the chat opens. Each budget is what the variant draws now: a change that adds to one fails here.

const picture = (alt: string) => ({ src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", alt, width: 1200, height: 800 });

const variants: { variant: string; lightbox: ReactElement; elements: number; components: number }[] = [
  { variant: "a picture in a mosaic", lightbox: <Lightbox label="Photo from Ana" layout="mosaic" images={[picture("A lake")]} />, elements: 6, components: 1 },
  { variant: "six pictures in a mosaic", lightbox: <Lightbox label="Photos from Ana" layout="mosaic" images={["A", "B", "C", "D", "E", "F"].map(picture)} />, elements: 20, components: 2 },
  { variant: "four pictures as thumbnails", lightbox: <Lightbox label="Kitchen photos" images={["A", "B", "C", "D"].map(picture)} />, elements: 18, components: 1 },
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

describe("Lightbox's weight", () => {
  it.each(variants)("draws $variant, unopened, in no more than $elements elements and $components components", async ({ lightbox, elements, components }) => {
    const host = document.createElement("div");
    host.dataset["testHarness"] = "";
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(lightbox));
    const drawnElements = host.querySelectorAll("*").length;
    const drawnComponents = componentsUnder(host);
    await act(async () => root.unmount());
    host.remove();
    expect(drawnElements, "elements").toBeLessThanOrEqual(elements);
    expect(drawnComponents, "components").toBeLessThanOrEqual(components);
  });
});
