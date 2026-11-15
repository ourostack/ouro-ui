import { Suspense, type JSX } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import { watchLayoutReads } from "@/registry/ouro/lib/ouro/testing/layout-reads";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Mounting a component must not make the browser lay the page out: inside the commit, each read
// (getComputedStyle, getBoundingClientRect, offset*, client*, scroll*) forces style and layout before
// the first paint, and a screen of many components pays for each. Every component's docs demo mounts
// here, in each engine, and may read nothing, except for a demo in `waivers` with the reason.

const modules = import.meta.glob<{ default: () => JSX.Element }>("../site/src/docs/demos/*.demo.tsx");

/** Demos whose mount reads layout, by item name, each with what it reads and why it stays. A waiver that stops reading fails, so it goes with the fix. */
const waivers: Record<string, string> = {
  "chart": "Recharts measures its container and tick text before it can draw a first frame, and it is third-party code",
  "composer": "the composer measures its action row's offsetHeight before paint so the text box and its buttons are sized in the first frame",
  "family-bar": "the bar measures which chips fit before paint, or the first frame would show chips that overflow and then drop them",
  "hero": "the hero checks whether its picture is shown (getComputedStyle) before paint, to choose between the picture and its fallback in the first frame",
  "level-meter": "Base UI's Slider reads getComputedStyle on its track in a callback it runs at mount (the read is in @base-ui/react, so only an upstream change can move it)",
  "media-tile": "the tile compares scrollWidth with clientWidth before paint to decide whether its caption is cut off, so the first frame shows the right tooltip state",
  "message-list": "the list needs its scroll and client sizes to pin the first frame to the newest message, and to anchor older messages; without them the first frame would paint at the top and jump",
  "navbar": "the bar reads getComputedStyle on the document to size its padding to the safe area in the first frame",
  "navigation-menu": "Base UI's composite root checks each item's visibility with getComputedStyle when its item map changes; the read is Base UI's, so only an upstream change can move it",
  "pagination": "the control measures how many page buttons fit before paint, or the first frame would show a row that overflows and then collapses",
  "radio-group": "Base UI's radio group calls scrollIntoViewIfNeeded for the checked item at mount, which reads scroll and client sizes; the read is Base UI's, so only an upstream change can move it",
  "slider": "Base UI's Slider reads getComputedStyle on its track in a callback it runs at mount; the read is in @base-ui/react, so only an upstream change can move it",
  "snap-pip": "the picture-in-picture window reads its own and its container's sizes to place itself at a snap point in the first frame, or it would paint at the corner and jump",
  "stacked-layout": "its navbar reads getComputedStyle on the document to size to the safe area in the first frame",
  "tab-bar": "the bar reads the window's inner size and visual viewport, which are cheap and force no layout, to know whether the keyboard is up; the guard counts the viewport reads, and the first frame needs the answer",
  "tabs": "the indicator and the selected tab need their offsets and scroll sizes in the first frame, and Base UI's tabs list reads sizes and calls scrollIntoViewIfNeeded for the selected tab",
  "thread-rail": "it mounts a message list, which pins the first frame to the newest message and needs scroll and client sizes to do so",
};

/** Demos that read at mount in WebKit alone, each with the reason; a demo here must read in WebKit and read nothing in Chromium. */
const webkitWaivers: Record<string, string> = {
  "autocomplete": "WebKit cannot size a text box by its content, so the text box measures its scroll height before the first paint, or the first frame would show one line and then jump",
  "text-area": "WebKit cannot size a text box by its content, so it measures its scroll height before the first paint, or the first frame would show one line and then jump",
};

const names = Object.keys(modules)
  .map((path) => path.replace(/^.*\/(.+)\.demo\.tsx$/, "$1"))
  .toSorted();

function mount(Demo: () => JSX.Element) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  // A synchronous commit stops at the commit itself: reads made by effects after paint are not mount reads.
  flushSync(() => root.render(<Suspense fallback={null}><Demo /></Suspense>));
  return async () => {
    await act(async () => root.unmount());
    host.remove();
  };
}

beforeAll(async () => {
  // The development theme check reads once per page, so the first mount is not a component's.
  const unmount = mount(() => <Button>Warm up</Button>);
  await unmount();
});

describe("mounting a docs demo", () => {
  it.each(names)("reads no layout: %s", async (name) => {
    const Demo = (await modules[`../site/src/docs/demos/${name}.demo.tsx`]!()).default;
    // Render once first: each component's own once-per-page work is not what a second mount costs.
    await mount(Demo)();
    const watch = watchLayoutReads();
    let unmount: (() => Promise<void>) | undefined;
    try {
      unmount = mount(Demo);
    } finally {
      watch.stop();
    }
    await unmount?.();
    const found = watch.names();
    const detail = [...new Set(watch.reads.map((read) => `${read.name} on ${read.target}`))].join("; ");
    const webkit = !/Chrome/.test(navigator.userAgent);
    if (webkitWaivers[name]) {
      if (webkit) expect(found.length, `${name} is waived in WebKit (${webkitWaivers[name]}) but reads nothing: remove the waiver`).toBeGreaterThan(0);
      else expect(found, `${name} reads layout in Chromium (${detail}): read it after paint`).toEqual([]);
    } else if (waivers[name]) expect(found.length, `${name} is waived (${waivers[name]}) but reads nothing: remove the waiver`).toBeGreaterThan(0);
    else expect(found, `${name}'s mount reads layout (${detail}): read it on first use or after paint, or waive it with a reason in test/mount-reads.test.tsx`).toEqual([]);
  });
});
