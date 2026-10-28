import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { menuItemClass, menuSheetPopupClass, menuSheetPositionerClass } from "@/registry/ouro/components/ouro/menu/menu-styles";
import { describeFindings, scan, scanStory, scanStoryViolations, storyScanTimeout } from "./story-axe.ts";
import { cleanupStories, closeOverlay, openOverlay, overlayOpeners, renderStory, selectedStories, setScheme, settle, stories, story, storyFiles } from "./stories.tsx";
import { sliced } from "./slice.ts";

// Every Storybook story renders and passes axe with zero violations (spec §8:
// "axe checks in every story"), closed and with each of its overlays open.
// Runs in Chromium and WebKit, at a phone width and a desktop width, so both
// of Dialog's presentations are scanned.

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  await cleanupStories();
});

it("covers every story file, each with stories", () => {
  // test/stories.tsx finds the files by glob; the reference stories and Button must be among them.
  expect(Object.keys(storyFiles)).toEqual(expect.arrayContaining(["Button", "SheetFeel"]));
  for (const [file, composed] of Object.entries(storyFiles)) expect(Object.keys(composed).length, file).toBeGreaterThan(0);
  // Every plain opener a story names is a button in that story (overlayOpeners throws otherwise).
  expect(stories.filter((entry) => entry.parameters.plainOpeners).map((entry) => entry.id)).toEqual(expect.arrayContaining(["Dialog/Controlled", "Sheet/Controlled"]));
});

it("does not scan a sheet before its deferred starting style leaves", async () => {
  const host = await renderStory(() => (
    <div className={menuSheetPositionerClass}>
      <div role="menu" data-open="" data-starting-style="" className={menuSheetPopupClass}>
        <a role="menuitem" className={menuItemClass} href="#print">Print</a>
      </div>
    </div>
  ));
  const popup = host.querySelector<HTMLElement>('[role="menu"]')!;
  let frame = 0;
  const enter = () => {
    if (++frame < 8) requestAnimationFrame(enter);
    else {
      popup.removeAttribute("data-starting-style");
    }
  };
  requestAnimationFrame(enter);
  await settle();
  const violations = await scan(popup);
  expect(describeFindings(violations)).toBe("");
  expect(popup.hasAttribute("data-starting-style")).toBe(false);
});

it.each([
  { id: "Tooltip/Playground", phase: /^with the tooltip of ".+" open$/ },
  { id: "NavigationMenu/Playground", phase: /^with the navigation panel of ".+" open$/ },
  { id: "HoverCard/Playground", phase: /^with the hover card of ".+" open$/ },
])("opens the popups of $id that no aria-haspopup names, and scans the page with one open", async ({ id, phase }) => {
  const { phases } = await scanStoryViolations(id, story(id));
  expect(phases[0]).toBe("closed");
  expect(phases.slice(1)).toEqual(expect.arrayContaining([expect.stringMatching(phase)]));
}, storyScanTimeout);

it("still reports a genuine offscreen skip link with no target", async () => {
  const host = await renderStory(() => (
    <a href="#missing-content" style={{ position: "fixed", top: "100vh" }}>Skip to content</a>
  ));
  expect((await scan(host)).map((finding) => finding.rule)).toContain("skip-link");
});

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });

  describe.each(["light", "dark"] as const)("%s", (scheme) => {
    it.each(sliced(selectedStories))("$id has no axe violations, closed and with each overlay open", async ({ id, Story }) => {
      setScheme(scheme);
      expect(await scanStory(id, Story)).toBe("");
    }, storyScanTimeout);
  });
});

// A component root sets no margin of its own. Margin between components is the app's layout: a
// parent's `space-y-4` puts it on its children with a zero-specificity rule, which any margin
// class on the child, even `m-0`, would beat.
describe("component roots leave their margin to the app", () => {
  it.each(sliced(selectedStories))("$id has no margin reset on a component root", async ({ id, Story }) => {
    const host = await renderStory(Story);
    await settle();
    const resets = (root: ParentNode) =>
      [...root.querySelectorAll<HTMLElement>("[data-ouro]")]
        .filter((element) => [...element.classList].some((token) => /^-?m[xytblrse]?-0$/.test(token)))
        .map((element) => element.getAttribute("data-ouro"));
    const found = resets(document);
    for (const opener of overlayOpeners(id, host)) {
      await openOverlay(opener);
      found.push(...resets(document));
      await closeOverlay();
    }
    expect([...new Set(found)]).toEqual([]);
  });
});
