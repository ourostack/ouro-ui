import { Suspense, type JSX } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import { watchLayoutReads, type LayoutRead } from "@/registry/ouro/lib/ouro/testing/layout-reads";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { itemFor } from "@/registry/ouro/components/ouro/inspector/inspector-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Mounting a component must not make the browser lay the page out: inside the commit, each read
// (getComputedStyle, getBoundingClientRect, offset*, client*, scroll*) forces style and layout before
// the first paint, and a screen of many components pays for each. Every component's docs demo mounts
// here, in each engine, and may read nothing, except for a demo in `waivers` with the reason.
//
// The page patterns an app installs whole (registry/ouro/patterns) have no docs demo, so each mounts here too, and may
// read only what its waived components do: a read counts as a component's when the innermost root (`data-ouro`) around
// what it reads is that component's, and anything else is the pattern's own.

const modules = import.meta.glob<{ default: () => JSX.Element }>("../site/src/docs/demos/*.demo.tsx");
const patterns = import.meta.glob<Record<string, unknown>>(["../registry/ouro/patterns/*/*.tsx", "!../registry/ouro/patterns/**/*.{test,stories}.tsx"]);

/** Demos whose mount reads layout, by item name, each with what it reads and why it stays. A waiver that stops reading fails, so it goes with the fix. */
const waivers: Record<string, string> = {
  "chart": "the plot reads its box's client size and font (getComputedStyle) before paint to lay out its axes and marks, so the first frame shows the plot rather than an empty box that fills a frame later",
  "conversation-find": "its demo mounts a message list, which pins the first frame to the newest message and needs scroll and client sizes to do so, and the find box takes focus on open",
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
  "thread-layout": "it mounts a message list in its open rail, which pins the first frame to the newest message and needs scroll and client sizes to do so",
  "thread-rail": "it mounts a message list, which pins the first frame to the newest message and needs scroll and client sizes to do so",
};

/** Demos that read at mount in WebKit alone, each with the reason; a demo here must read in WebKit and read nothing in Chromium. */
const webkitWaivers: Record<string, string> = {
  "autocomplete": "WebKit cannot size a text box by its content, so the text box measures its scroll height before the first paint, or the first frame would show one line and then jump",
  "text-area": "WebKit cannot size a text box by its content, so it measures its scroll height before the first paint, or the first frame would show one line and then jump",
};

/** The page patterns, by folder name. */
const patternNames = [...new Set(Object.keys(patterns).map((path) => path.replace(/^.*\/patterns\/([^/]+)\/.*$/, "$1")))].toSorted();

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

/**
 * The registry item that made a read: the item of the innermost `data-ouro` root around what it read, or null for the
 * page's own. Only that root counts, so a waived component does not cover a component inside it. The page can't tell a
 * component's own elements from plain markup the pattern passes into it, so a waived component covers a read of the
 * pattern's plain children; none of the patterns renders a waived component today. A read of the window or the document
 * finds no root and counts as the page's own, so a pattern that adopts a component waived for one (Navbar, TabBar)
 * fails here until the test can tell that read apart.
 */
function readerOf(read: LayoutRead): string | null {
  const { target } = read;
  const node = target instanceof Node ? target : target instanceof Range ? target.commonAncestorContainer : null;
  const root = (node instanceof Element ? node : node?.parentElement)?.closest("[data-ouro]");
  return root ? itemFor(root.getAttribute("data-ouro")!) : null;
}

/** The reads no waiver covers: a read in a component with no waiver, and every read of the page's own. */
function unwaived(reads: readonly LayoutRead[], webkit: boolean): string[] {
  return reads.flatMap((read) => {
    const item = readerOf(read);
    if (item && (waivers[item] || (webkit && webkitWaivers[item]))) return [];
    const where = read.target instanceof Element ? `<${read.target.localName}${read.target.getAttribute("data-ouro") ? ` data-ouro="${read.target.getAttribute("data-ouro")}"` : ""}>` : String(read.target);
    return [`${read.name} on ${where}, ${item ? `in ${item}, which has no waiver` : "the page's own"}`];
  });
}

describe("mounting a page pattern", () => {
  it("counts a read in a waived component as that component's, and fails one in a component with no waiver or the page's own", () => {
    const screen = document.createElement("main");
    screen.innerHTML = '<div data-ouro="tabs"><i>Tab</i><span data-ouro="card"></span><p>Pane</p></div><div data-ouro="radio-group"><b data-ouro="radio"></b></div><div data-ouro="sheet-portal"></div>';
    const [tabs, radios, portal] = [...screen.children];
    const tabText = document.createRange();
    tabText.selectNodeContents(tabs!.querySelector("i")!.firstChild!);
    // Tabs, and a radio whose root names radio-group's item, are waived.
    expect(unwaived([{ name: "offsetHeight", target: tabs!.querySelector("i") }, { name: "getBoundingClientRect", target: tabText }, { name: "scrollIntoView", target: radios!.firstElementChild }], false)).toEqual([]);
    // Inside Tabs, a component with no waiver is held all the same.
    expect(unwaived([{ name: "offsetWidth", target: tabs!.querySelector("span") }], false)).toEqual(['offsetWidth on <span data-ouro="card">, in card, which has no waiver']);
    // Plain markup passed into Tabs reads as Tabs' own: the gap readerOf's comment names.
    expect(unwaived([{ name: "offsetHeight", target: tabs!.querySelector("p") }], false)).toEqual([]);
    expect(unwaived([{ name: "getComputedStyle", target: screen }, { name: "clientWidth", target: portal }, { name: "innerWidth", target: window }], false)).toEqual([
      "getComputedStyle on <main>, the page's own",
      'clientWidth on <div data-ouro="sheet-portal">, the page\'s own',
      "innerWidth on [object Window], the page's own",
    ]);
    const field = document.createElement("div");
    field.setAttribute("data-ouro", "text-area");
    expect(unwaived([{ name: "scrollHeight", target: field }], true)).toEqual([]);
    expect(unwaived([{ name: "scrollHeight", target: field }], false)).toEqual(['scrollHeight on <div data-ouro="text-area">, in text-area, which has no waiver']);
  });

  it("finds every page pattern", () => {
    expect(patternNames).toEqual(expect.arrayContaining(["dashboard-page", "list-detail-page", "settings-page"]));
  });

  it.each(patternNames)("reads only what its waived components do: %s", async (name) => {
    const path = `../registry/ouro/patterns/${name}/${name}.tsx`;
    const pages = Object.entries(await patterns[path]!()).filter(([name, value]) => /Page$/.test(name) && typeof value === "function");
    expect(pages, `${path} exports one page`).toHaveLength(1);
    const Page = pages[0]![1] as () => JSX.Element;
    await mount(Page)();
    const watch = watchLayoutReads();
    let unmount: (() => Promise<void>) | undefined;
    try {
      unmount = mount(Page);
    } finally {
      watch.stop();
    }
    // Read who read what before unmounting, while the elements are still in their roots.
    const found = unwaived(watch.reads, !/Chrome/.test(navigator.userAgent));
    await unmount?.();
    expect(found, `${name}'s mount reads layout no waiver covers: read it on first use or after paint`).toEqual([]);
  });
});
