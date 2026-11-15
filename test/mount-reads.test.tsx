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

/** Demos whose mount reads layout, by item name, each with what it reads and why it stays. Each is a read to move past the first paint; a waiver that stops reading fails, so it goes with the fix. */
const waivers: Record<string, string> = {
  "chart": "reads bounding boxes and text styles at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "color-scheme-toggle": "reads getComputedStyle on a button at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "composer": "reads getComputedStyle and offsetHeight at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "family-bar": "reads getComputedStyle and getBoundingClientRect at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "hero": "reads getComputedStyle on its picture at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "level-meter": "reads getComputedStyle on its meter at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "live-captions": "reads getComputedStyle on a button at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "media-tile": "reads scrollWidth and clientWidth at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "message-list": "reads scroll and client sizes at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "navbar": "reads getComputedStyle on the document at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "navigation-menu": "reads getComputedStyle on a button at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "pagination": "reads getComputedStyle and clientWidth at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "radio-group": "reads scroll and client sizes on its group at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "segmented-control": "reads getComputedStyle on a button at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "slider": "reads getComputedStyle on its track at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "snap-pip": "reads client, offset and bounding sizes at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "stacked-layout": "reads getComputedStyle on the document at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "tab-bar": "reads the window's inner size at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "tabs": "reads scroll and client sizes and getComputedStyle on a tab at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "thread-rail": "reads scroll and client sizes at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "time-grid": "reads offsetHeight, scrollTop and clientHeight at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
  "toolbar": "reads getComputedStyle, bounding boxes and clientWidth at mount; not yet traced to its cause, so it stays waived until a fix moves the read past the first paint",
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
