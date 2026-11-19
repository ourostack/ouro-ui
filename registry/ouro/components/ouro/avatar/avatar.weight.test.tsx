import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A chat draws an avatar beside every message, so its count of elements and components is paid
// once per message. Each budget is what the variant draws now: a change that adds to one fails here.

const picture = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

const variants: { variant: string; avatar: ReactElement; loaded?: true; elements: number; components: number }[] = [
  { variant: "initials", avatar: <Avatar name="Ana Lind" />, elements: 3, components: 1 },
  { variant: "a picture, once it has loaded", avatar: <Avatar name="Ana Lind" src={picture} />, loaded: true, elements: 3, components: 1 },
  { variant: "a presence dot", avatar: <Avatar name="Ana Lind" presence="busy" presenceLabel="Busy" />, elements: 6, components: 2 },
  { variant: "a name still loading", avatar: <Avatar name={null} />, elements: 3, components: 2 },
  { variant: "a group chat of three", avatar: <Avatar name="Crew" members={[{ name: "Ana Lind" }, { name: "Ben Ito" }, { name: "Cy Voss" }]} size="lg" />, elements: 5, components: 8 },
  { variant: "an agent's glyph", avatar: <Avatar name="Halden" shape="agent" />, elements: 5, components: 2 },
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

describe("Avatar's weight", () => {
  it.each(variants)("draws $variant in no more than $elements elements and $components components", async ({ avatar, loaded, elements, components }) => {
    const host = document.createElement("div");
    host.dataset["testHarness"] = "";
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(avatar));
    if (loaded) await expect.poll(() => host.querySelector("img")).not.toBeNull();
    const drawnElements = host.querySelectorAll("*").length;
    const drawnComponents = componentsUnder(host);
    await act(async () => root.unmount());
    host.remove();
    expect(drawnElements, "elements").toBeLessThanOrEqual(elements);
    expect(drawnComponents, "components").toBeLessThanOrEqual(components);
  });
});

// Mounting is timed per instance against bare elements drawn the same way, so the ratio holds on a slow or busy host.
// Each side is warmed once and timed at its best of three, and the bare side is drawn 5,000 times, so its time is
// tens of milliseconds or more rather than one, which a single scheduler pause would multiply.
const RATIO = 60;
const crew = [{ name: "Ana Lind" }, { name: "Ben Ito" }, { name: "Cy Voss" }];

async function mountMs(render: () => ReactElement, count: number): Promise<number> {
  const host = document.createElement("div");
  host.dataset["testHarness"] = "";
  document.body.append(host);
  const root = createRoot(host);
  const start = performance.now();
  await act(async () => root.render(<>{Array.from({ length: count }, (_, index) => <div key={index}>{render()}</div>)}</>));
  const took = performance.now() - start;
  await act(async () => root.unmount());
  host.remove();
  return took;
}

/** The best of three timed mounts of `count` copies, after one to warm up, per copy. */
async function perCopyMs(render: () => ReactElement, count: number): Promise<number> {
  await mountMs(render, count);
  const runs: number[] = [];
  for (let run = 0; run < 3; run++) runs.push(await mountMs(render, count));
  return Math.min(...runs) / count;
}

describe("Avatar's mount time", () => {
  it("mounts a group chat avatar, one of 100, in a bounded multiple of the time a bare span takes, one of 5,000", async () => {
    const group = await perCopyMs(() => <Avatar name="Crew" members={crew} />, 100);
    const bare = await perCopyMs(() => <span>Crew</span>, 5000);
    expect(group / bare, `ratio (group ${(group * 1000).toFixed(0)} µs, bare ${(bare * 1000).toFixed(0)} µs)`).toBeLessThan(RATIO);
  });
});
