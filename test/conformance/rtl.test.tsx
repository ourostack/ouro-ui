import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { cleanupStories, closeOverlay, openOverlay, overlayOpeners, renderStory, settle } from "../stories.tsx";
import { conformanceStories, describeElement, layOut } from "./harness.ts";

// Right to left. Every story renders in a right-to-left page (`dir="rtl"` on <html>, as an app
// in Arabic or Hebrew sets it, so portals inherit it), closed and with each overlay open, at a
// phone width and a desktop width, and nothing may stick out of the viewport sideways: a part
// placed with a physical side (`left-*`, `ml-*`, `pr-*`) instead of a logical one (`start-*`,
// `ms-*`, `pe-*`) lands on the wrong side, and the far side of a right-to-left page cannot be
// scrolled to. scripts/source-rules.mjs (`physicalUtilities`) bans those classes in the source.

/** Whether an element's overflow is clipped or scrolls, so what sticks out of it is inside it, not the page. */
function clips(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.overflowX !== "visible" || style.contain.includes("paint");
}

/** Whether an element is hidden from sight: not rendered, clipped away to a pixel (`sr-only`) or fully transparent. */
function unseen(element: Element): boolean {
  if (!element.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return true;
  const box = element.getBoundingClientRect();
  if (box.width <= 1 || box.height <= 1) return true;
  const style = getComputedStyle(element);
  return style.clipPath !== "none" && style.clipPath.startsWith("inset(50%");
}

/**
 * The elements that stick out of the viewport sideways by more than half a pixel, with no
 * clipping or scrolling element between them and the page to hold them.
 */
export function horizontalOverflow(): string[] {
  const width = document.documentElement.clientWidth;
  const found: string[] = [];
  const visit = (element: Element, held: boolean) => {
    if (element.matches("script, style, template, [data-base-ui-focus-guard]")) return;
    if (!held && !unseen(element)) {
      const box = element.getBoundingClientRect();
      if (box.left < -0.5 || box.right > width + 0.5) found.push(`${Math.round(box.left)}..${Math.round(box.right)} of 0..${width}: ${describeElement(element)}`);
    }
    for (const child of element.children) visit(child, held || clips(element));
  };
  for (const child of document.body.children) visit(child, false);
  return found;
}

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  document.documentElement.dir = "rtl";
});
afterEach(async () => {
  document.documentElement.removeAttribute("dir");
  await cleanupStories();
});

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("right to left at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });

  it.each(conformanceStories)("$id stays inside the viewport, closed and with each overlay open", async ({ id, Story, parameters }) => {
    const host = await renderStory(Story);
    layOut(host, parameters);
    await settle();
    const found = horizontalOverflow().map((line) => `closed: ${line}`);
    for (const opener of overlayOpeners(id, host)) {
      await openOverlay(opener);
      found.push(...horizontalOverflow().map((line) => `with "${opener.name}" open: ${line}`));
      await closeOverlay();
    }
    expect(found.join("\n")).toBe("");
  });
});
