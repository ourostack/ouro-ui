import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { menuItemClass, menuSheetPopupClass, menuSheetPositionerClass } from "@/registry/ouro/components/ouro/menu/menu-styles";
import { axeExclude } from "@/registry/ouro/lib/ouro/testing/axe";
import {
  cleanupStories,
  closeOverlay,
  openOverlay,
  overlayOpeners,
  renderStory,
  setScheme,
  settle,
  stories,
  storyFiles,
} from "./stories.tsx";

// Every Storybook story renders and passes axe with zero violations (spec §8:
// "axe checks in every story"), closed and with each of its overlays open.
// Runs in Chromium and WebKit, at a phone width and a desktop width, so both
// of Dialog's presentations are scanned.

/** axe's result as readable lines: rule, impact, help and the offending selectors. */
function describeViolations(violations: axe.Result[]): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`).join("\n"),
    )
    .join("\n");
}

/**
 * Scans the page, or only `within` when given. A list's popup (Combobox, Select) is scanned on
 * its own: while it is open, Base UI hides the rest of the page from assistive tech with
 * `aria-hidden` (FloatingFocusManager), so axe would report the page's focusable fields as
 * hidden yet focusable (aria-hidden-focus). Focus stays in the input, and Tab closes the
 * popup and unhides the page; the closed scan covers the page itself.
 */
async function scan(within?: HTMLElement): Promise<axe.Result[]> {
  // Base UI's focus-trap guards are excluded, not a rule (axeExclude, which ships to
  // apps): in WebKit they take `role="button"` on purpose, with no name, so
  // VoiceOver's virtual cursor fires focus on them and the modal's trap catches it
  // (Base UI utils/FocusGuard). They are visually hidden and never reached by Tab.
  const context: axe.ElementContext = { include: [within ?? document.documentElement], exclude: axeExclude.map((selector) => [selector]) };
  const result = await axe.run(context, {
    resultTypes: ["violations"],
    rules: {
      // Page-structure rules, off as in Storybook's a11y addon: a story is a
      // fragment of a page, so it has no `<main>`, no `<h1>` and no landmarks
      // of its own. The app that places the component owns those.
      "landmark-one-main": { enabled: false },
      "page-has-heading-one": { enabled: false },
      region: { enabled: false },
    },
  });
  return result.violations;
}

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
  expect(describeViolations(violations)).toBe("");
  expect(popup.hasAttribute("data-starting-style")).toBe(false);
});

it("still reports a genuine offscreen skip link with no target", async () => {
  const host = await renderStory(() => (
    <a href="#missing-content" style={{ position: "fixed", top: "100vh" }}>Skip to content</a>
  ));
  expect((await scan(host)).map((violation) => violation.id)).toContain("skip-link");
});

describe.each([
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
])("at $width px", ({ width, height }) => {
  beforeEach(async () => {
    await page.viewport(width, height);
  });

  describe.each(["light", "dark"] as const)("%s", (scheme) => {
    it.each(stories)("$id has no axe violations, closed and with each overlay open", async ({ id, Story }) => {
      setScheme(scheme);
      const host = await renderStory(Story);
      await settle();
      const found: string[] = [];
      const closed = await scan();
      if (closed.length > 0) found.push(`closed:\n${describeViolations(closed)}`);
      for (const opener of overlayOpeners(id, host)) {
        const popup = await openOverlay(opener);
        const open = await scan(popup.matches('[role="dialog"], [role="alertdialog"]') ? undefined : popup);
        if (open.length > 0) found.push(`with "${opener.name}" open:\n${describeViolations(open)}`);
        await closeOverlay();
      }
      expect(found.join("\n\n")).toBe("");
    });
  });
});
