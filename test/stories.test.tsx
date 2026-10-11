import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
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

const storyModules = import.meta.glob("../registry/**/*.stories.tsx");

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

async function scan(): Promise<axe.Result[]> {
  // Base UI's focus-trap guards are excluded, not a rule: in WebKit they take
  // `role="button"` on purpose, with no name, so VoiceOver's virtual cursor
  // fires focus on them and the modal's trap catches it (Base UI
  // utils/FocusGuard). They are visually hidden and never reached by Tab.
  const context: axe.ElementContext = { include: [document.documentElement], exclude: [["[data-base-ui-focus-guard]"]] };
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

it("covers every story file", () => {
  const files = Object.keys(storyModules).map((path) => path.replace(/^.*\/([\w-]+)\.stories\.tsx$/, "$1"));
  expect(Object.keys(storyFiles).map((name) => name.toLowerCase()).sort()).toEqual(files.sort());
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
        await openOverlay(opener);
        const open = await scan();
        if (open.length > 0) found.push(`with "${opener.textContent}" open:\n${describeViolations(open)}`);
        await closeOverlay();
      }
      expect(found.join("\n\n")).toBe("");
    });
  });
});
